import type { ElementTable } from 'claude-code'

import type { Task, Teammate, When } from '../types'
import type { SprintConfig } from './sprints'
import { stateWord } from './activity'
import { cacheText, isFull } from './team'
import { isOpen, whenOf } from './tasks'

// The board page of the Sprint pane: the task list (sections, then the collapsed closed tasks) in a
// window of fixed height, and under it, pinned to the bottom, the selected task's box and the key line.
// Nothing the person selects, moves or finishes changes a line count; only opening "Closed" does.
// Colours are Claude Code's theme keys: claude (its orange), suggestion (selection), success, warning, subtle.

export type Ui = ElementTable
export type Section = { when: When; title: string; tasks: Task[] }

const ORDER: readonly When[] = ['now', 'this-sprint', 'next-sprint', 'backlog']

export const TITLES: Record<When, string> = {
  now: 'Currently working on',
  'this-sprint': 'This sprint',
  'next-sprint': 'Next sprint',
  backlog: 'Backlog',
}

export const ICONS: Record<When, string> = { now: '⚡', 'this-sprint': '◆', 'next-sprint': '◇', backlog: '○' }

const BAR_CELLS = 5
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** The box (four lines, its border, the gap above) and the key line under the list. */
const BOTTOM_ROWS = 8

// ---- Pure ----

/** The open tasks, one section per "when". */
export function sectionsOf(tasks: readonly Task[], day: string, config: SprintConfig): Section[] {
  return ORDER.map(when => ({
    when,
    title: TITLES[when],
    tasks: tasks.filter(task => isOpen(task) && whenOf(task, day, config) === when),
  }))
}

/** "Sep 28–Oct 4", or "Oct 5–11" within one month. */
export function shortDates(start: string, end: string): string {
  const [startMonth, startDate] = [Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10))]
  const [endMonth, endDate] = [Number(end.slice(5, 7)) - 1, Number(end.slice(8, 10))]
  const tail = endMonth === startMonth ? `${endDate}` : `${MONTHS[endMonth]} ${endDate}`
  return `${MONTHS[startMonth]} ${startDate}–${tail}`
}

/**
 * Which slice of the list's lines a window of `rows` shows so that line `focus` is in it: the whole
 * list when it fits, else a window that keeps the focused line away from the edges.
 */
export function windowOf(count: number, rows: number, focus: number): { start: number; end: number } {
  if (count <= rows) return { start: 0, end: count }
  const start = Math.min(Math.max(0, focus - Math.floor(rows / 2)), count - rows)
  return { start, end: start + rows }
}

/** The section one step up (-1) or down (+1), if any. */
export function neighbour(when: When, step: -1 | 1): When | undefined {
  return ORDER[ORDER.indexOf(when) + step]
}

/** b: out of the backlog to the top of the plan (this sprint), or into the backlog. */
export function backlogToggle(when: When): When {
  return when === 'backlog' ? 'this-sprint' : 'backlog'
}

/**
 * Where ⌥↑ (-1) or ⌥↓ (+1) takes a task: one place up or down in its section, or across the edge
 * into the neighbouring section (to its bottom going up, its top going down). Returns that section
 * and its task ids in their new order; undefined at the very top or bottom.
 */
export function shifted(sections: readonly Section[], id: string, step: -1 | 1): { when: When; ids: string[] } | undefined {
  const from = sections.find(section => section.tasks.some(task => task.id === id))
  if (from === undefined) return undefined
  const ids = from.tasks.map(task => task.id)
  const at = ids.indexOf(id)
  const other = ids[at + step]
  if (other !== undefined) {
    const next = [...ids]
    next[at] = other
    next[at + step] = id
    return { when: from.when, ids: next }
  }
  const target = neighbour(from.when, step)
  if (target === undefined) return undefined
  const there = sections.find(section => section.when === target)?.tasks.map(task => task.id) ?? []
  return { when: target, ids: step === -1 ? [...there, id] : [id, ...there] }
}

/** In move mode, what each visible row is: the moving task, the focusable row just above or below it, or still text. */
export type RowRole = 'moving' | 'slot-up' | 'slot-down' | 'still'

/**
 * While a task moves, only it and its two neighbours can take the focus ring, so ↑ can only land
 * on "slot-up" and ↓ on "slot-down"; the pane turns that landing into one step of the task.
 */
export function rowRoles(ids: readonly string[], movingId: string): Record<string, RowRole> {
  const at = ids.indexOf(movingId)
  const roles: Record<string, RowRole> = {}
  ids.forEach((id, index) => {
    roles[id] = index === at ? 'moving' : index === at - 1 ? 'slot-up' : index === at + 1 ? 'slot-down' : 'still'
  })
  return roles
}

/** How many of the bar's cells are filled for `done` of `total`. */
export function filledCells(done: number, total: number, cells = BAR_CELLS): number {
  return total === 0 ? 0 : Math.round((done / total) * cells)
}

export function percentText(mate: Teammate | undefined): string {
  return mate?.percent === undefined ? '' : `${Math.round(mate.percent)}%`
}

// ---- Drawing ----

export type BoardActions = {
  /** A click or Enter on a task: selects it, or on the selected one hands the keys to its actions. */
  pressTask: (task: Task, isSelected: boolean) => void
  /** ⌥↑ and ⌥↓: one place up or down in the list. */
  shift: (task: Task, step: -1 | 1) => void
  move: (task: Task, to: When) => void
  open: (task: Task) => void
  start: (task: Task) => void
  done: (task: Task) => void
  reopen: (task: Task) => void
  /** Move: the task follows ↑↓ until Enter. */
  startMoving: (task: Task) => void
  toggleClosed: () => void
  showConfig: () => void
}

/** The selected task: its section (none for a closed one) and the mode the keys are in. */
export type Selected = { task: Task; when?: When; mate?: Teammate; isMoving?: boolean; isActing?: boolean }

/** A sprint section's facts for its heading: "Week 40 · Sep 28–Oct 4 · 3 days left". */
export type SprintFacts = { details: string; isLastDay?: boolean; done?: number; total?: number; goal?: string }

export type BoardProps = {
  ui: Ui
  sections: Section[]
  sprints: Partial<Record<When, SprintFacts>>
  closed: Task[]
  isClosedOpen: boolean
  selected?: Selected
  team: Teammate[]
  limit: number
  /** Whether the pane holds the keyboard; the selection is bright only then. */
  hasKeys: boolean
  /** The pane body's height; the list gets what the bottom box leaves. Unknown: no window. */
  bodyRows?: number
  /** Whether the surface runs Client modules (terminal, desktop) for the spinner. */
  canSpin: boolean
  actions: BoardActions
}

type Line = { node: JSX.Element; taskId?: string }

export function Board(props: BoardProps) {
  const { ui, selected, bodyRows, hasKeys, limit, actions } = props
  const { Box, Text } = ui
  const lines = listLines(props)
  // At any pane height the list takes exactly what the box leaves, so the box sits at the bottom.
  const rows = bodyRows === undefined ? undefined : Math.max(1, bodyRows - BOTTOM_ROWS)
  const focus = Math.max(0, lines.findIndex(line => line.taskId !== undefined && line.taskId === selected?.task.id))
  const shown = rows === undefined ? { start: 0, end: lines.length } : windowOf(lines.length, rows, focus)
  const above = shown.start
  const below = lines.length - shown.end
  const window = lines.slice(shown.start, shown.end).map(line => line.node)
  const hasRoomForMarks = window.length >= 3
  if (hasRoomForMarks && above > 0) window[0] = <Text color="subtle">  ⋯ {above + 1} more above</Text>
  if (hasRoomForMarks && below > 0) window[window.length - 1] = <Text color="subtle">  ⋯ {below + 1} more below</Text>
  return (
    <Box flexDirection="column">
      <Box flexDirection="column" height={rows} overflow="hidden">
        {window}
      </Box>
      <Detail ui={ui} selected={selected} limit={limit} hasKeys={hasKeys} actions={actions} />
      <KeyLine ui={ui} hasKeys={hasKeys} selected={selected} actions={actions} />
    </Box>
  )
}

/** Every line of the list, one row each: the four sections, then the closed tasks. */
function listLines({ ui, sections, sprints, closed, isClosedOpen, selected, team, limit, hasKeys, canSpin, actions }: BoardProps): Line[] {
  const { Text } = ui
  const ids = sections.flatMap(section => section.tasks.map(task => task.id))
  const roles = selected?.isMoving ? rowRoles(ids, selected.task.id) : undefined
  const lockedTo = selected?.isActing ? selected.task.id : undefined
  const blank = (): Line => ({ node: <Text> </Text> })
  const row = (task: Task, role?: RowRole): Line => ({
    taskId: task.id,
    node: (
      <TaskRow ui={ui} task={task} isSelected={task.id === selected?.task.id} hasKeys={hasKeys} role={role} canSpin={canSpin}
        isFirst={ids[0] === task.id} isLast={ids.at(-1) === task.id}
        owner={team.find(one => one.name === task.owner)} limit={limit} actions={actions} />
    ),
  })
  const stillUnlessSelected = (task: Task): RowRole | undefined =>
    roles?.[task.id] ?? (lockedTo !== undefined && task.id !== lockedTo ? 'still' : undefined)
  const lines: Line[] = []
  for (const [index, section] of sections.entries()) {
    if (index > 0) lines.push(blank())
    const sprint = sprints[section.when]
    lines.push({ node: <SectionTitle ui={ui} section={section} sprint={sprint} /> })
    if (section.when === 'this-sprint') {
      lines.push({ node: <Text color="subtle" wrap="truncate-end">  {sprint?.goal ? `◎ ${sprint.goal}` : ' '}</Text> })
    }
    if (section.tasks.length === 0) lines.push({ node: <Text color="subtle">  —  empty</Text> })
    for (const task of section.tasks) lines.push(row(task, stillUnlessSelected(task)))
  }
  lines.push(blank())
  const isLocked = roles !== undefined || lockedTo !== undefined
  lines.push({ node: <ClosedTitle ui={ui} count={closed.length} isOpen={isClosedOpen} isLocked={isLocked} actions={actions} /> })
  if (isClosedOpen) {
    for (const task of closed) lines.push(row(task, roles !== undefined || (lockedTo !== undefined && task.id !== lockedTo) ? 'still' : undefined))
  }
  return lines
}

type TitleProps = { ui: Ui; section: Section; sprint?: SprintFacts }

/** "◆ This sprint 2 · Week 40 · Sep 28–Oct 4 · 3 days left" with the progress at the right. */
function SectionTitle({ ui, section, sprint }: TitleProps) {
  const { Box, Text } = ui
  const hasProgress = sprint?.total !== undefined && sprint.done !== undefined
  const filled = hasProgress ? filledCells(sprint.done ?? 0, sprint.total ?? 0) : 0
  return (
    <Box flexDirection="row" justifyContent="space-between" columnGap={2} height={1} overflow="hidden">
      <Text wrap="truncate-end">
        <Text color={section.when === 'now' ? 'claude' : 'subtle'}>{ICONS[section.when]} </Text>
        <Text bold>{section.title}</Text>
        {section.tasks.length > 0 ? <Text color="subtle"> {section.tasks.length}</Text> : ''}
        {sprint ? <Text color="subtle"> · {sprint.details}</Text> : ''}
      </Text>
      {hasProgress && (
        <Box flexDirection="row" columnGap={1} flexShrink={0}>
          <Text>
            <Text color="success">{'▰'.repeat(filled)}</Text>
            <Text color="subtle">{'▱'.repeat(BAR_CELLS - filled)}</Text>
          </Text>
          <Text color={sprint?.total && sprint.done === sprint.total ? 'success' : 'subtle'}>{sprint?.done}/{sprint?.total}</Text>
        </Box>
      )}
    </Box>
  )
}

type ClosedProps = { ui: Ui; count: number; isOpen: boolean; isLocked: boolean; actions: BoardActions }

/** "✓ Closed · 5 ▸": Enter or a click opens and closes it (text while a task moves or acts). */
function ClosedTitle({ ui, count, isOpen, isLocked, actions }: ClosedProps) {
  const { Box, Button, Text } = ui
  const label = `Closed · ${count} ${isOpen ? '▾' : '▸'}`
  return (
    <Box flexDirection="row" columnGap={1} height={1} overflow="hidden">
      <Text color="success">✓</Text>
      {isLocked ? <Text color="subtle">{label}</Text> : <Button key="closed" plain dimColor label={label} onPress={actions.toggleClosed} />}
    </Box>
  )
}

type RowProps = {
  ui: Ui
  task: Task
  isSelected: boolean
  hasKeys: boolean
  canSpin: boolean
  /** Set while some task moves or acts: who may still take the ring (see rowRoles). */
  role?: RowRole
  isFirst: boolean
  isLast: boolean
  owner?: Teammate
  limit: number
  actions: BoardActions
}

/**
 * Always one line: selection bar, status, id and title, then owner, context and roll-overs.
 * While a task moves, the title is a button only on it and its two neighbours (the slots ↑ and ↓
 * land on); the moving row with no row above or below gets a ▲ or ▼ slot of its own instead.
 */
function TaskRow({ ui, task, isSelected, hasKeys, canSpin, role, isFirst, isLast, owner, limit, actions }: RowProps) {
  const { Box, Button, Text } = ui
  const isOverLimit = owner !== undefined && isFull(owner, limit)
  const isMoving = role === 'moving'
  const isClosed = !isOpen(task)
  const label = `${task.id}  ${task.title}`
  const title =
    role === 'still' ? (
      <Text color="subtle" wrap="truncate-end">{label}</Text>
    ) : role === 'slot-up' || role === 'slot-down' ? (
      // The ring never rests here: the pane's ui.focus hook turns landing on it into a step.
      <Button key={role} plain dimColor label={label} onPress={() => undefined} />
    ) : (
      <Button key={`task-${task.id}`} plain dimColor={isClosed} autoFocus={isSelected ? true : undefined}
        label={label} onPress={() => actions.pressTask(task, isSelected)} />
    )
  return (
    <Box flexDirection="row" columnGap={1} height={1} overflow="hidden"
      backgroundColor={isSelected && hasKeys ? 'userMessageBackground' : undefined}>
      <Text color={isMoving ? 'claude' : hasKeys ? 'suggestion' : 'subtle'}>{isMoving ? '↕' : isSelected ? '▌' : ' '}</Text>
      <StatusIcon ui={ui} task={task} canSpin={canSpin} />
      {isMoving && isFirst && <Button key="slot-up" plain label="▲" onPress={() => undefined} />}
      <Box flexGrow={1} flexShrink={1}>{title}</Box>
      {isMoving && isLast && <Button key="slot-down" plain label="▼" onPress={() => undefined} />}
      {isMoving && <Text color="claude">moving</Text>}
      {!isMoving && !isClosed && task.owner !== '' && <Text color="subtle">{task.owner}</Text>}
      {!isMoving && !isClosed && owner?.percent !== undefined && <Text color={isOverLimit ? 'warning' : 'subtle'}>{percentText(owner)}</Text>}
      {!isMoving && !isClosed && owner?.cache === 'cold' && <Text color="warning">cold</Text>}
      {!isMoving && !isClosed && task.rolled > 0 && <Text color="subtle">↻{task.rolled}</Text>}
    </Box>
  )
}

/** ✓ done, ✗ cancelled, a spinner while worked on (static where the surface runs no Client), else a dot. */
function StatusIcon({ ui, task, canSpin }: { ui: Ui; task: Task; canSpin: boolean }) {
  const { Text } = ui
  if (task.status === 'done') return <Text color="success">✓</Text>
  if (task.status === 'cancelled') return <Text color="subtle">✗</Text>
  if (task.status !== 'doing') return <Text color="subtle">·</Text>
  if (canSpin && 'Client' in ui) return <ui.Client key={`spin-${task.id}`} module="./spinner.tsx" props={null} width={1} />
  return <Text color="claude">✻</Text>
}

type DetailProps = { ui: Ui; selected?: Selected; limit: number; hasKeys: boolean; actions: BoardActions }

/** One line of the detail area: exactly one row high whatever it holds. */
function DetailLine({ ui, children }: { ui: Ui; children?: JSX.Children }) {
  const { Box } = ui
  return (
    <Box flexDirection="row" columnGap={2} height={1} overflow="hidden">
      {children}
    </Box>
  )
}

/**
 * The selected task's box, pinned under the list, always four lines: what it is, who works on it,
 * what can be done, how to move it. Its content changes; its height never does.
 */
function Detail({ ui, selected, limit, hasKeys, actions }: DetailProps) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="subtle" paddingX={1}>
      {selected ? (
        <DetailOf ui={ui} selected={selected} limit={limit} hasKeys={hasKeys} actions={actions} />
      ) : (
        <>
          <DetailLine ui={ui}><Text color="subtle">No task selected</Text></DetailLine>
          <DetailLine ui={ui}><Text color="subtle">Create one by asking Claude, e.g. “add a task to …”</Text></DetailLine>
          <DetailLine ui={ui} />
          <DetailLine ui={ui} />
        </>
      )}
    </Box>
  )
}

function DetailOf({ ui, selected, limit, hasKeys, actions }: Required<Pick<DetailProps, 'selected'>> & Omit<DetailProps, 'selected'>) {
  const { Text } = ui
  const { task, when, mate } = selected
  const place = when ? `${ICONS[when]} ${TITLES[when]}` : task.status === 'cancelled' ? '✗ Cancelled' : '✓ Closed'
  return (
    <>
      <DetailLine ui={ui}>
        <Text bold wrap="truncate-end">{task.id}  {task.title}</Text>
        <Text color="subtle">{place}</Text>
      </DetailLine>
      <DetailLine ui={ui}>
        <Text color="subtle">⎿</Text>
        {mate ? (
          <Text wrap="truncate-end"><Text>{mate.name} </Text><MateFacts ui={ui} mate={mate} limit={limit} /></Text>
        ) : (
          <Text color="subtle">{statusWords(task)}</Text>
        )}
      </DetailLine>
      {selected.isMoving ? <MovingLines ui={ui} /> : when ? <ActionLines ui={ui} selected={selected} when={when} hasKeys={hasKeys} actions={actions} /> : <ClosedLines ui={ui} task={task} actions={actions} />}
    </>
  )
}

function statusWords(task: Task): string {
  if (task.status === 'done') return 'done'
  if (task.status === 'cancelled') return 'cancelled'
  return task.status === 'doing' ? `${task.owner || 'someone'} · not running` : 'not started'
}

/** While the task moves nothing else takes the ring, so these two lines are text. */
function MovingLines({ ui }: { ui: Ui }) {
  const { Text } = ui
  return (
    <>
      <DetailLine ui={ui}><Text color="claude">↕ ↑↓ move it · ⏎ stop</Text></DetailLine>
      <DetailLine ui={ui}><Text color="subtle">Within its section, and on into the next at an edge; every step is saved.</Text></DetailLine>
    </>
  )
}

type ActionProps = { ui: Ui; selected: Selected; when: When; hasKeys: boolean; actions: BoardActions }

/** The actions, in reading order so ←/→ walk them: Open … Move, then ⌥↑ ⌥↓ and the backlog toggle. */
function ActionLines({ ui, selected, when, hasKeys, actions }: ActionProps) {
  const { Button, Text } = ui
  const { task, mate } = selected
  const toggle = backlogToggle(when)
  return (
    <>
      <DetailLine ui={ui}>
        <Button key="open" plain hotkey="o" label="Open" onPress={() => actions.open(task)} />
        {task.status === 'todo' && <Button key="start" plain hotkey="s" label="Start" onPress={() => actions.start(task)} />}
        <Button key="done" plain hotkey="d" label="Mark as done" onPress={() => actions.done(task)} />
        <Button key="move" plain hotkey="m" label="Move" onPress={() => actions.startMoving(task)} />
      </DetailLine>
      <DetailLine ui={ui}>
        {/* Chord buttons fire even from the prompt, so they exist only while the board holds the keys. */}
        {hasKeys ? (
          <Button key="up" plain dimColor action="app:diffFileListUp" label="⌥↑" onPress={() => actions.shift(task, -1)} />
        ) : (
          <Text color="subtle">⌥↑</Text>
        )}
        {hasKeys ? (
          <Button key="down" plain dimColor action="app:diffFileListDown" label="⌥↓" onPress={() => actions.shift(task, 1)} />
        ) : (
          <Text color="subtle">⌥↓</Text>
        )}
        <Text color="subtle">move up/down</Text>
        <Button key="toggle" plain dimColor hotkey="b" label={TITLES[toggle]} onPress={() => actions.move(task, toggle)} />
      </DetailLine>
    </>
  )
}

/** A closed task can be reopened into this sprint, or its file opened. */
function ClosedLines({ ui, task, actions }: { ui: Ui; task: Task; actions: BoardActions }) {
  const { Button, Text } = ui
  return (
    <>
      <DetailLine ui={ui}>
        <Button key="reopen" plain hotkey="r" label="Reopen" onPress={() => actions.reopen(task)} />
        <Button key="open" plain hotkey="o" label="Open" onPress={() => actions.open(task)} />
      </DetailLine>
      <DetailLine ui={ui}><Text color="subtle">Reopen puts it back into this sprint.</Text></DetailLine>
    </>
  )
}

type KeyLineProps = { ui: Ui; hasKeys: boolean; selected?: Selected; actions: BoardActions }

/**
 * One line at the bottom: the keys of the mode the board is in, or, while the pane does not hold
 * the keys, the one key that gives them to it, so a key that does nothing is never a mystery.
 */
function KeyLine({ ui, hasKeys, selected, actions }: KeyLineProps) {
  const { Box, Button, Text } = ui
  const isLocked = selected?.isMoving === true || selected?.isActing === true
  const words = selected?.isMoving ? '↑↓ move · ⏎ stop' : selected?.isActing ? '←→ choose · ⏎ run · ↑ back to the list' : '↑↓ select · ⏎ actions'
  return (
    <Box flexDirection="row" columnGap={2} height={1} overflow="hidden">
      {hasKeys ? <Text color={isLocked ? 'claude' : 'subtle'}>{words}</Text> : <Text color="suggestion">The keys are with the prompt · click or ctrl+x tab to use the board</Text>}
      {!isLocked && <Button key="config" plain dimColor hotkey="c" label="settings" onPress={actions.showConfig} />}
    </Box>
  )
}

/** "working · editing auth.ts · 63%": the state coloured by meaning, the rest quiet. */
export function MateFacts({ ui, mate, limit }: { ui: Ui; mate: Teammate; limit: number }) {
  const { Text } = ui
  const state = mate.status === 'running' && !mate.activity ? 'idle' : stateWord(mate.status)
  const isOverLimit = isFull(mate, limit)
  const isWaiting = mate.activity === 'waiting for your answer'
  return (
    <Text wrap="truncate-end">
      <Text color={isWaiting ? 'warning' : state === 'working' ? 'claude' : state === 'done' ? 'success' : 'subtle'}>{state}</Text>
      {mate.activity ? <Text color="subtle"> · {mate.activity}</Text> : ''}
      {mate.percent !== undefined ? <Text color={isOverLimit ? 'warning' : 'subtle'}> · {percentText(mate)}</Text> : ''}
      {cacheText(mate) ? <Text color={mate.cache === 'cold' ? 'warning' : 'subtle'}> · {cacheText(mate)}</Text> : ''}
    </Text>
  )
}
