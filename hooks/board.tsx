import type { ElementTable } from 'claude-code'

import type { Task, Teammate, When } from '../types'
import type { SprintConfig } from './sprints'
import { stateWord } from './activity'
import { isFull } from './team'
import { isOpen, whenOf } from './tasks'

// The board page of the Sprint pane: one line per open task, then a detail area of fixed height for
// the selected task, so selecting, moving or finishing never shifts the rows.
// Colours are Claude Code's theme keys: claude (its orange), suggestion (selection), success, warning, subtle.

export type Ui = ElementTable
export type Section = { when: When; title: string; tasks: Task[] }

const ORDER: readonly When[] = ['now', 'this-sprint', 'next-sprint', 'backlog']

export const TITLES: Record<When, string> = {
  now: 'Now',
  'this-sprint': 'This sprint',
  'next-sprint': 'Next sprint',
  backlog: 'Backlog',
}

export const ICONS: Record<When, string> = { now: '⚡', 'this-sprint': '◆', 'next-sprint': '◇', backlog: '○' }

const BAR_CELLS = 10

// ---- Pure ----

/** The open tasks, one section per "when". */
export function sectionsOf(tasks: readonly Task[], day: string, config: SprintConfig): Section[] {
  return ORDER.map(when => ({
    when,
    title: TITLES[when],
    tasks: tasks.filter(task => isOpen(task) && whenOf(task, day, config) === when),
  }))
}

/** The id `step` rows after `id` (j: +1, k: -1), kept within the list; the first or last when none is selected. */
export function stepId(ids: readonly string[], id: string | undefined, step: -1 | 1): string | undefined {
  const at = id === undefined ? -1 : ids.indexOf(id)
  if (at < 0) return step === 1 ? ids[0] : ids.at(-1)
  return ids[Math.min(ids.length - 1, Math.max(0, at + step))]
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

/** How many of the bar's cells are filled for `done` of `total`. */
export function filledCells(done: number, total: number, cells = BAR_CELLS): number {
  return total === 0 ? 0 : Math.round((done / total) * cells)
}

export function percentText(mate: Teammate | undefined): string {
  return mate?.percent === undefined ? '' : `${Math.round(mate.percent)}%`
}

// ---- Drawing ----

export type BoardActions = {
  /** A click or Enter on a task: selects it, or opens it when it is already selected. */
  pressTask: (task: Task, isSelected: boolean) => void
  /** j and k: the next or previous task. */
  selectStep: (step: -1 | 1) => void
  /** ⌥↑ and ⌥↓: one place up or down in the list. */
  shift: (task: Task, step: -1 | 1) => void
  move: (task: Task, to: When) => void
  open: (task: Task) => void
  start: (task: Task) => void
  done: (task: Task) => void
  /** Shows the session of the teammate working on the task. */
  view: (mate: Teammate) => void
  showConfig: () => void
}

export type Selected = { task: Task; when: When; mate?: Teammate }

export type BoardProps = {
  ui: Ui
  sections: Section[]
  doneCount: number
  selected?: Selected
  team: Teammate[]
  limit: number
  /** Whether the pane holds the keyboard; the selection is bright only then. */
  hasKeys: boolean
  actions: BoardActions
}

export function Board({ ui, sections, doneCount, selected, team, limit, hasKeys, actions }: BoardProps) {
  const { Box, Text } = ui
  const visible = sections.filter(section => section.tasks.length > 0 || section.when === 'this-sprint')
  return (
    <Box flexDirection="column">
      {visible.map(section => (
        <Box flexDirection="column" marginTop={1}>
          <SectionTitle ui={ui} section={section} />
          {section.tasks.length === 0 && <Text color="subtle">   Nothing planned yet</Text>}
          {section.tasks.map(task => (
            <TaskRow ui={ui} task={task} isSelected={task.id === selected?.task.id} hasKeys={hasKeys}
              owner={team.find(one => one.name === task.owner)} limit={limit} actions={actions} />
          ))}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color="success">✓ </Text>
        <Text color="subtle">{doneCount} done this sprint</Text>
      </Box>
      <Detail ui={ui} selected={selected} limit={limit} actions={actions} />
      <KeyLine ui={ui} hasKeys={hasKeys} actions={actions} />
    </Box>
  )
}

function SectionTitle({ ui, section }: { ui: Ui; section: Section }) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="row" columnGap={1}>
      <Text color={section.when === 'now' ? 'claude' : 'subtle'}>{ICONS[section.when]}</Text>
      <Text bold>{section.title}</Text>
      {section.tasks.length > 0 && <Text color="subtle">{section.tasks.length}</Text>}
    </Box>
  )
}

type RowProps = {
  ui: Ui
  task: Task
  isSelected: boolean
  hasKeys: boolean
  owner?: Teammate
  limit: number
  actions: BoardActions
}

/** Always one line: selection bar, status, id and title, then owner, context and roll-overs. */
function TaskRow({ ui, task, isSelected, hasKeys, owner, limit, actions }: RowProps) {
  const { Box, Button, Text } = ui
  const isOverLimit = owner !== undefined && isFull(owner, limit)
  return (
    <Box flexDirection="row" columnGap={1} height={1} overflow="hidden"
      backgroundColor={isSelected ? 'userMessageBackground' : undefined}>
      <Text color={hasKeys ? 'suggestion' : 'subtle'}>{isSelected ? '▌' : ' '}</Text>
      <StatusIcon ui={ui} task={task} />
      <Box flexGrow={1} flexShrink={1}>
        <Button key={`task-${task.id}`} plain autoFocus={isSelected ? true : undefined}
          label={`${task.id}  ${task.title}`} onPress={() => actions.pressTask(task, isSelected)} />
      </Box>
      {task.owner !== '' && <Text color="subtle">{task.owner}</Text>}
      {owner?.percent !== undefined && <Text color={isOverLimit ? 'warning' : 'subtle'}>{percentText(owner)}</Text>}
      {task.rolled > 0 && <Text color="subtle">↻{task.rolled}</Text>}
    </Box>
  )
}

/** A spinner while the task is worked on (static where the surface runs no Client), else a quiet dot. */
function StatusIcon({ ui, task }: { ui: Ui; task: Task }) {
  const { Text } = ui
  if (task.status !== 'doing') return <Text color="subtle">·</Text>
  if ('Client' in ui) return <ui.Client key={`spin-${task.id}`} module="./spinner.tsx" props={null} width={1} />
  return <Text color="claude">✻</Text>
}

type DetailProps = { ui: Ui; selected?: Selected; limit: number; actions: BoardActions }

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
 * The selected task's area under the list, always five lines: what it is, who works on it,
 * what can be done, how to move it, and where to. Its content changes; its height never does.
 */
function Detail({ ui, selected, limit, actions }: DetailProps) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="subtle" paddingX={1}>
      {selected ? (
        <DetailOf ui={ui} selected={selected} limit={limit} actions={actions} />
      ) : (
        <>
          <DetailLine ui={ui}><Text color="subtle">No task selected</Text></DetailLine>
          <DetailLine ui={ui}><Text color="subtle">Create one by asking Claude, e.g. “add a task to …”</Text></DetailLine>
          <DetailLine ui={ui} />
          <DetailLine ui={ui} />
          <DetailLine ui={ui} />
        </>
      )}
    </Box>
  )
}

function DetailOf({ ui, selected, limit, actions }: Required<Pick<DetailProps, 'selected'>> & Omit<DetailProps, 'selected'>) {
  const { Button, Text } = ui
  const { task, when, mate } = selected
  const toggle = backlogToggle(when)
  const targets = ORDER.filter(to => to !== when)
  return (
    <>
      <DetailLine ui={ui}>
        <Text bold wrap="truncate-end">{task.id}  {task.title}</Text>
        <Text color="subtle">{ICONS[when]} {TITLES[when]}</Text>
      </DetailLine>
      <DetailLine ui={ui}>
        <Text color="subtle">⎿</Text>
        {mate ? (
          <Text wrap="truncate-end"><Text>{mate.name} </Text><MateFacts ui={ui} mate={mate} limit={limit} /></Text>
        ) : (
          <Text color="subtle">{task.status === 'doing' ? `${task.owner || 'someone'} · not running` : 'not started'}</Text>
        )}
      </DetailLine>
      <DetailLine ui={ui}>
        <Button key="open" plain hotkey="o" label="Open" onPress={() => actions.open(task)} />
        {task.status === 'todo' && <Button key="start" plain hotkey="s" label="Start" onPress={() => actions.start(task)} />}
        <Button key="done" plain hotkey="d" label="Mark as done" onPress={() => actions.done(task)} />
        {mate && <Button key="view" plain hotkey="v" label="View session" onPress={() => actions.view(mate)} />}
      </DetailLine>
      <DetailLine ui={ui}>
        <Button key="up" plain dimColor action="app:diffFileListUp" label="⌥↑" onPress={() => actions.shift(task, -1)} />
        <Button key="down" plain dimColor action="app:diffFileListDown" label="⌥↓" onPress={() => actions.shift(task, 1)} />
        <Text color="subtle">move up/down</Text>
        <Button key="toggle" plain dimColor hotkey="b" label={TITLES[toggle]} onPress={() => actions.move(task, toggle)} />
      </DetailLine>
      <DetailLine ui={ui}>
        <Text color="subtle">Move to</Text>
        {targets.map(to => (
          <Button key={`to-${to}`} plain label={`${ICONS[to]} ${TITLES[to]}`} onPress={() => actions.move(task, to)} />
        ))}
      </DetailLine>
    </>
  )
}

type KeyLineProps = { ui: Ui; hasKeys: boolean; actions: BoardActions }

/**
 * One line at the bottom. While the pane holds the keys: how to select. While it does not: the
 * one key that gives them to it, so a key that does nothing is never a mystery.
 */
function KeyLine({ ui, hasKeys, actions }: KeyLineProps) {
  const { Box, Button, Text } = ui
  return (
    <Box flexDirection="row" columnGap={2} height={1} overflow="hidden">
      {hasKeys ? (
        <Text color="subtle">↑↓ select · ⏎ open</Text>
      ) : (
        <Text color="suggestion">ctrl+x tab to use the keys here</Text>
      )}
      <Button key="next" plain dimColor hotkey="j" label="↓" onPress={() => actions.selectStep(1)} />
      <Button key="previous" plain dimColor hotkey="k" label="↑" onPress={() => actions.selectStep(-1)} />
      <Button key="config" plain dimColor hotkey="c" label="settings" onPress={actions.showConfig} />
    </Box>
  )
}

type HeaderProps = { ui: Ui; label: string; goal: string; done: number; total: number }

/** ✻ Sprint · dates, a progress bar on the right, the goal under them. */
export function Header({ ui, label, goal, done, total }: HeaderProps) {
  const { Box, Text } = ui
  const filled = filledCells(done, total)
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between" columnGap={2}>
        <Box flexDirection="row" columnGap={1} flexShrink={1}>
          <Text color="claude">✻</Text>
          <Text bold wrap="truncate-end">{label}</Text>
        </Box>
        <Box flexDirection="row" columnGap={1} flexShrink={0}>
          <Text>
            <Text color="success">{'▰'.repeat(filled)}</Text>
            <Text color="subtle">{'▱'.repeat(BAR_CELLS - filled)}</Text>
          </Text>
          <Text color={total > 0 && done === total ? 'success' : 'subtle'}>{done}/{total}</Text>
        </Box>
      </Box>
      <Box paddingLeft={2}>
        <Text color="subtle" italic={goal === ''} wrap="truncate-end">{goal === '' ? 'No sprint goal yet' : goal}</Text>
      </Box>
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
    </Text>
  )
}
