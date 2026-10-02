import type { ElementTable } from 'claude-code'

import type { Task, Teammate, When } from '../types'
import type { SprintConfig } from './sprints'
import { stateWord } from './activity'
import { isFull } from './team'
import { isOpen, whenOf } from './tasks'

// The board page of the Sprint pane: open tasks by section, a menu under the clicked task, a key line.
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

/** How many of the bar's cells are filled for `done` of `total`. */
export function filledCells(done: number, total: number, cells = BAR_CELLS): number {
  return total === 0 ? 0 : Math.round((done / total) * cells)
}

export function percentText(mate: Teammate | undefined): string {
  return mate?.percent === undefined ? '' : `${Math.round(mate.percent)}%`
}

// ---- Drawing ----

export type BoardActions = {
  /** A click or Enter on a task: opens its menu, or closes it when open. */
  pressTask: (task: Task) => void
  /** j and k: the next or previous task. */
  selectStep: (step: -1 | 1) => void
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
  menuId: string
  team: Teammate[]
  limit: number
  actions: BoardActions
}

export function Board({ ui, sections, doneCount, selected, menuId, team, limit, actions }: BoardProps) {
  const { Box, Text } = ui
  const visible = sections.filter(section => section.tasks.length > 0 || section.when === 'this-sprint')
  return (
    <Box flexDirection="column">
      {visible.map(section => (
        <Box flexDirection="column" marginTop={1}>
          <SectionTitle ui={ui} section={section} />
          {section.tasks.length === 0 && <Text color="subtle">   Nothing planned yet</Text>}
          {section.tasks.map(task => {
            const isSelected = task.id === selected?.task.id
            const mate = team.find(one => one.name === task.owner)
            return (
              <Box flexDirection="column">
                <TaskRow ui={ui} task={task} isSelected={isSelected} owner={mate} limit={limit} actions={actions} />
                {mate && task.status === 'doing' && <MateLine ui={ui} mate={mate} limit={limit} />}
                {isSelected && <MoveHint ui={ui} task={task} when={section.when} actions={actions} />}
                {task.id === menuId && <TaskMenu ui={ui} task={task} when={section.when} mate={mate} actions={actions} />}
              </Box>
            )
          })}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color="success">✓ </Text>
        <Text color="subtle">{doneCount} done this sprint</Text>
      </Box>
      <KeyLine ui={ui} selected={selected} actions={actions} />
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

type RowProps = { ui: Ui; task: Task; isSelected: boolean; owner?: Teammate; limit: number; actions: BoardActions }

/**
 * Accent bar when selected, a spinner while worked on, id and title, then owner, context and roll-overs.
 * A teammate at work gets its own line under the row instead (MateLine).
 */
function TaskRow({ ui, task, isSelected, owner, limit, actions }: RowProps) {
  const { Box, Button, Text } = ui
  const isOverLimit = owner !== undefined && isFull(owner, limit)
  const hasMateLine = owner !== undefined && task.status === 'doing'
  return (
    <Box flexDirection="row" columnGap={1} backgroundColor={isSelected ? 'userMessageBackground' : undefined}>
      <Text color="suggestion">{isSelected ? '▌' : ' '}</Text>
      <StatusIcon ui={ui} task={task} />
      <Box flexGrow={1} flexShrink={1}>
        <Button key={`task-${task.id}`} plain label={`${task.id}  ${task.title}`} onPress={() => actions.pressTask(task)} />
      </Box>
      {task.owner !== '' && !hasMateLine && <Text color="subtle">{task.owner}</Text>}
      {owner?.percent !== undefined && !hasMateLine && (
        <Text color={isOverLimit ? 'warning' : 'subtle'}>{percentText(owner)}</Text>
      )}
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

/** Under a task in progress: ⎿ who works on it, their state, what they are doing, their context. */
function MateLine({ ui, mate, limit }: { ui: Ui; mate: Teammate; limit: number }) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="row" columnGap={1} paddingLeft={4}>
      <Text color="subtle">⎿</Text>
      <Text>{mate.name}</Text>
      <MateFacts ui={ui} mate={mate} limit={limit} />
    </Box>
  )
}

type MenuProps = { ui: Ui; task: Task; when: When; mate?: Teammate; actions: BoardActions }

/**
 * Under the selected row: ⌥↑ and ⌥↓ ride the engine's diff-list actions (meta+up/down and
 * ctrl+up/down), the only modified keys a pane can take; b toggles the backlog. Each is clickable.
 */
function MoveHint({ ui, task, when, actions }: MenuProps) {
  const { Box, Button } = ui
  const up = neighbour(when, -1)
  const down = neighbour(when, 1)
  const toggle = backlogToggle(when)
  return (
    <Box flexDirection="row" columnGap={2} paddingLeft={4}>
      {up && <Button key="up" plain dimColor action="app:diffFileListUp" label={`⌥↑ ${TITLES[up]}`} onPress={() => actions.move(task, up)} />}
      {down && <Button key="down" plain dimColor action="app:diffFileListDown" label={`⌥↓ ${TITLES[down]}`} onPress={() => actions.move(task, down)} />}
      <Button key="toggle" plain dimColor hotkey="b" label={TITLES[toggle]} onPress={() => actions.move(task, toggle)} />
    </Box>
  )
}

/** The clicked task's options in a small card right under its row. */
function TaskMenu({ ui, task, when, mate, actions }: MenuProps) {
  const { Box, Button, Text } = ui
  const targets = ORDER.filter(to => to !== when)
  return (
    <Box flexDirection="column" marginLeft={4} paddingX={1} borderStyle="round" borderColor="subtle">
      <Box flexDirection="row" columnGap={3}>
        <Button key="menu-open" plain label="↗ Open" onPress={() => actions.open(task)} />
        {task.status === 'todo' && <Button key="menu-start" plain label="▶ Start" onPress={() => actions.start(task)} />}
        <Button key="menu-done" plain label="✓ Mark as done" onPress={() => actions.done(task)} />
        {mate && <Button key="menu-view" plain label="◉ View session" onPress={() => actions.view(mate)} />}
      </Box>
      <Box flexDirection="row" columnGap={2} flexWrap="wrap">
        <Text color="subtle">Move to</Text>
        {targets.map(to => (
          <Button key={`menu-${to}`} plain label={`${ICONS[to]} ${TITLES[to]}`} onPress={() => actions.move(task, to)} />
        ))}
      </Box>
    </Box>
  )
}

type KeyLineProps = { ui: Ui; selected?: Selected; actions: BoardActions }

/** The board's keys, quiet at the bottom; the lettered ones are buttons too. */
function KeyLine({ ui, selected, actions }: KeyLineProps) {
  const { Box, Button, Text } = ui
  const task = selected?.task
  return (
    <Box flexDirection="row" columnGap={2} flexWrap="wrap" marginTop={1}>
      <Text color="subtle">↑↓ select</Text>
      <Button key="next" plain dimColor hotkey="j" label="↓" onPress={() => actions.selectStep(1)} />
      <Button key="previous" plain dimColor hotkey="k" label="↑" onPress={() => actions.selectStep(-1)} />
      <Text color="subtle">⏎ menu</Text>
      {task && <Text color="subtle">⌥↑↓ move</Text>}
      {task && <Button key="open" plain dimColor hotkey="o" label="open" onPress={() => actions.open(task)} />}
      {task?.status === 'todo' && <Button key="start" plain dimColor hotkey="s" label="start" onPress={() => actions.start(task)} />}
      {task && <Button key="done" plain dimColor hotkey="d" label="mark as done" onPress={() => actions.done(task)} />}
      {selected?.mate && <Button key="view" plain dimColor hotkey="v" label="view session" onPress={() => selected.mate && actions.view(selected.mate)} />}
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
  const state = stateWord(mate.status)
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
