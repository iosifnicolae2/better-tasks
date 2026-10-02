import type { ElementTable } from 'claude-code'

import type { Task, Teammate, When } from '../types'
import type { SprintConfig } from './sprints'
import { isFull } from './team'
import { isOpen, whenOf } from './tasks'

// The board page of the Tasks pane: open tasks by section, a menu under the clicked task, a key line.

export type Ui = ElementTable
export type Section = { when: When; title: string; tasks: Task[] }

const ORDER: readonly When[] = ['now', 'this-sprint', 'next-sprint', 'backlog']

export const TITLES: Record<When, string> = {
  now: 'Now',
  'this-sprint': 'This sprint',
  'next-sprint': 'Next sprint',
  backlog: 'Backlog',
}

// ---- Pure ----

/** The open tasks, one section per "when". */
export function sectionsOf(tasks: readonly Task[], day: string, config: SprintConfig): Section[] {
  return ORDER.map(when => ({
    when,
    title: TITLES[when],
    tasks: tasks.filter(task => isOpen(task) && whenOf(task, day, config) === when),
  }))
}

/** The section above (-1) or below (+1), if any. */
export function stepTarget(from: When, step: -1 | 1): When | undefined {
  return ORDER[ORDER.indexOf(from) + step]
}

export function percentText(mate: Teammate | undefined): string {
  return mate?.percent === undefined ? '' : `${Math.round(mate.percent)}%`
}

// ---- Drawing ----

export type BoardActions = {
  /** A click or Enter on a task: opens its menu, or closes it when open. */
  pressTask: (task: Task) => void
  move: (task: Task, to: When) => void
  open: (task: Task) => void
  start: (task: Task) => void
  done: (task: Task) => void
  showConfig: () => void
}

export type Selected = { task: Task; when: When }

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
          <Text bold dimColor>{section.title.toUpperCase()}</Text>
          {section.tasks.length === 0 && <Text dimColor>  Nothing planned yet.</Text>}
          {section.tasks.map(task => (
            <Box flexDirection="column">
              <TaskRow ui={ui} task={task} isSelected={task.id === selected?.task.id}
                owner={team.find(mate => mate.name === task.owner)} limit={limit} actions={actions} />
              {task.id === menuId && <TaskMenu ui={ui} task={task} when={section.when} actions={actions} />}
            </Box>
          ))}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text bold dimColor>DONE THIS SPRINT · {doneCount}</Text>
      </Box>
      <KeyLine ui={ui} selected={selected} actions={actions} />
    </Box>
  )
}

type RowProps = { ui: Ui; task: Task; isSelected: boolean; owner?: Teammate; limit: number; actions: BoardActions }

/** Marker, id and title (the clickable part), then owner, context fill and roll-overs. */
function TaskRow({ ui, task, isSelected, owner, limit, actions }: RowProps) {
  const { Box, Button, Text } = ui
  const isOverLimit = owner !== undefined && isFull(owner, limit)
  return (
    <Box flexDirection="row" columnGap={1}>
      <Text color="suggestion">{isSelected ? '›' : ' '}</Text>
      <Box flexGrow={1} flexShrink={1}>
        <Button key={`task-${task.id}`} plain label={`${task.id}  ${task.title}`} onPress={() => actions.pressTask(task)} />
      </Box>
      {task.status === 'doing' && <Text dimColor>doing</Text>}
      {task.owner !== '' && <Text dimColor>{task.owner}</Text>}
      {owner?.percent !== undefined && (
        <Text color={isOverLimit ? 'warning' : undefined} dimColor={!isOverLimit}>{percentText(owner)}</Text>
      )}
      {task.rolled > 0 && <Text dimColor>↻{task.rolled}</Text>}
    </Box>
  )
}

type MenuProps = { ui: Ui; task: Task; when: When; actions: BoardActions }

/** The clicked task's options, right under its row. */
function TaskMenu({ ui, task, when, actions }: MenuProps) {
  const { Box, Button, Text } = ui
  const targets = (Object.keys(TITLES) as When[]).filter(to => to !== when)
  return (
    <Box flexDirection="row" columnGap={2} flexWrap="wrap" paddingLeft={4}>
      <Button key="menu-open" plain label="Open" onPress={() => actions.open(task)} />
      {task.status === 'todo' && <Button key="menu-start" plain label="Start" onPress={() => actions.start(task)} />}
      <Button key="menu-done" plain label="Done" onPress={() => actions.done(task)} />
      <Box flexDirection="row" columnGap={1}>
        <Text dimColor>Move to</Text>
        {targets.map(to => (
          <Button key={`menu-${to}`} plain label={TITLES[to]} onPress={() => actions.move(task, to)} />
        ))}
      </Box>
    </Box>
  )
}

type KeyLineProps = { ui: Ui; selected?: Selected; actions: BoardActions }

/**
 * Every key the board takes, each one also a button. ⌥↑ and ⌥↓ ride engine actions bound to
 * meta+up and meta+down (also ctrl+up/down), the only modified keys a plugin can receive.
 */
function KeyLine({ ui, selected, actions }: KeyLineProps) {
  const { Box, Button, Text } = ui
  if (selected === undefined) {
    return (
      <Box flexDirection="row" columnGap={2} marginTop={1}>
        <Text dimColor>↑↓ select · enter menu</Text>
        <Button key="config" plain hotkey="c" dimColor label="settings" onPress={actions.showConfig} />
      </Box>
    )
  }
  const { task, when } = selected
  const up = stepTarget(when, -1)
  const down = stepTarget(when, 1)
  return (
    <Box flexDirection="row" columnGap={2} flexWrap="wrap" marginTop={1}>
      <Button key="up" plain dimColor action="app:diffFileListUp" label="⌥↑ up" onPress={() => up && actions.move(task, up)} />
      <Button key="down" plain dimColor action="app:diffFileListDown" label="⌥↓ down" onPress={() => down && actions.move(task, down)} />
      <Button key="backlog" plain dimColor hotkey="b" label="backlog" onPress={() => actions.move(task, 'backlog')} />
      <Button key="open" plain dimColor hotkey="o" label="open" onPress={() => actions.open(task)} />
      {task.status === 'todo' && <Button key="start" plain dimColor hotkey="s" label="start" onPress={() => actions.start(task)} />}
      <Button key="done" plain dimColor hotkey="d" label="done" onPress={() => actions.done(task)} />
      <Button key="config" plain dimColor hotkey="c" label="settings" onPress={actions.showConfig} />
    </Box>
  )
}

type HeaderProps = { ui: Ui; label: string; goal: string; done: number; total: number }

/** Sprint · dates on the left, progress on the right, the goal under them. */
export function Header({ ui, label, goal, done, total }: HeaderProps) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between" columnGap={2}>
        <Text bold wrap="truncate-end">{label}</Text>
        <Text color={total > 0 && done === total ? 'success' : undefined} dimColor={done < total}>
          {done}/{total} done
        </Text>
      </Box>
      <Text dimColor wrap="truncate-end">{goal === '' ? 'No sprint goal yet' : `Goal: ${goal}`}</Text>
    </Box>
  )
}
