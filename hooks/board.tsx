import type { ElementTable } from 'claude-code'

import type { Task, Teammate, When } from '../types'
import type { SprintConfig } from './sprints'
import { isFull } from './team'
import { isOpen, whenOf } from './tasks'

// The board page of the Tasks pane: its columns, the Table and Kanban views, and the action bar.

export type Ui = ElementTable
export type View = 'table' | 'kanban'
export type ColumnId = When | 'done'
export type Column = { id: ColumnId; title: string; tasks: Task[] }

const OPEN_COLUMNS: readonly When[] = ['now', 'this-sprint', 'next-sprint', 'backlog']

export const TITLES: Record<ColumnId, string> = {
  now: 'Now',
  'this-sprint': 'This sprint',
  'next-sprint': 'Next sprint',
  backlog: 'Backlog',
  done: 'Done',
}

// ---- Pure ----

export function columnOf(task: Task, day: string, config: SprintConfig): ColumnId {
  return task.status === 'done' ? 'done' : whenOf(task, day, config)
}

/** The board's columns: open work by when, and what was finished in this sprint. */
export function columnsOf(tasks: readonly Task[], day: string, config: SprintConfig, current: string): Column[] {
  const open = OPEN_COLUMNS.map(id => ({
    id,
    title: TITLES[id],
    tasks: tasks.filter(task => isOpen(task) && whenOf(task, day, config) === id),
  }))
  const done = tasks.filter(task => task.status === 'done' && task.sprint === current)
  return [...open, { id: 'done', title: TITLES.done, tasks: done }]
}

/** Where ◀ (-1) or ▶ (+1) takes a task; ◀ from Done reopens it in this sprint. */
export function stepTarget(from: ColumnId, step: -1 | 1): When | undefined {
  if (from === 'done') return step === -1 ? 'this-sprint' : undefined
  return OPEN_COLUMNS[OPEN_COLUMNS.indexOf(from) + step]
}

export function percentText(mate: Teammate | undefined): string {
  return mate?.percent === undefined ? '' : `${Math.round(mate.percent)}%`
}

// ---- Drawing ----

export type BoardActions = {
  /** A press on a card: selects it, or opens it when it is already selected. */
  pressCard: (task: Task, isSelected: boolean) => void
  move: (task: Task, from: ColumnId, to: When) => void
  open: (task: Task) => void
  start: (task: Task) => void
  done: (task: Task) => void
  toggleView: () => void
  showConfig: () => void
}

export type BoardProps = {
  ui: Ui
  view: View
  columns: Column[]
  selected?: { task: Task; column: ColumnId }
  team: Teammate[]
  limit: number
  actions: BoardActions
}

export function Board({ ui, view, columns, selected, team, limit, actions }: BoardProps) {
  const { Box } = ui
  const cardProps = { ui, team, limit, selectedId: selected?.task.id, actions }
  return (
    <Box flexDirection="column">
      {view === 'kanban' ? <Kanban columns={columns} {...cardProps} /> : <Table columns={columns} {...cardProps} />}
      <TeamLine ui={ui} team={team} limit={limit} />
      <Box flexDirection="column" marginTop={1}>
        {selected && <ActionBar ui={ui} task={selected.task} column={selected.column} actions={actions} />}
        <NavBar ui={ui} view={view} hasSelection={selected !== undefined} actions={actions} />
      </Box>
    </Box>
  )
}

type CardsProps = {
  ui: Ui
  columns: Column[]
  team: Teammate[]
  limit: number
  selectedId?: string
  actions: BoardActions
}

function Table({ ui, columns, team, limit, selectedId, actions }: CardsProps) {
  const { Box, Text } = ui
  const done = columns.find(column => column.id === 'done')
  const visible = columns.filter(column => column.id !== 'done' && (column.tasks.length > 0 || column.id === 'this-sprint'))
  return (
    <Box flexDirection="column">
      {visible.map(column => (
        <Box flexDirection="column" marginTop={1}>
          <ColumnTitle ui={ui} column={column} />
          {column.tasks.length === 0 && <Text dimColor>  Nothing planned yet.</Text>}
          {column.tasks.map(task => (
            <Box flexDirection="row" gap={1}>
              <Box flexGrow={1} flexShrink={1}>
                <Card ui={ui} task={task} isSelected={task.id === selectedId} actions={actions} />
              </Box>
              <CardFacts ui={ui} task={task} team={team} limit={limit} />
            </Box>
          ))}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor bold>DONE · {done?.tasks.length ?? 0}</Text>
      </Box>
    </Box>
  )
}

function Kanban({ ui, columns, team, limit, selectedId, actions }: CardsProps) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="row" marginTop={1} columnGap={1}>
      {columns.map(column => (
        <Box flexDirection="column" flexGrow={1} flexShrink={1} width="20%">
          <ColumnTitle ui={ui} column={column} />
          {column.tasks.length === 0 && <Text dimColor>—</Text>}
          {column.tasks.map(task => (
            <Box flexDirection="column" marginBottom={1}>
              <Card ui={ui} task={task} isSelected={task.id === selectedId} actions={actions} />
              <CardFacts ui={ui} task={task} team={team} limit={limit} />
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )
}

function ColumnTitle({ ui, column }: { ui: Ui; column: Column }) {
  const { Text } = ui
  return (
    <Text bold dimColor wrap="truncate-end">
      {column.title.toUpperCase()} {column.tasks.length > 0 ? `· ${column.tasks.length}` : ''}
    </Text>
  )
}

type CardProps = { ui: Ui; task: Task; isSelected: boolean; actions: BoardActions }

function Card({ ui, task, isSelected, actions }: CardProps) {
  const { Button } = ui
  const label = `${isSelected ? '›' : ' '} ${task.id}  ${task.title}`
  return (
    <Button key={`card-${task.id}`} plain dimColor={task.status === 'done'} label={label}
      onPress={() => actions.pressCard(task, isSelected)} />
  )
}

/** Owner, their context fill, and how often the task rolled over. */
function CardFacts({ ui, task, team, limit }: { ui: Ui; task: Task; team: Teammate[]; limit: number }) {
  const { Box, Text } = ui
  const owner = team.find(mate => mate.name === task.owner)
  const isOverLimit = owner !== undefined && isFull(owner, limit)
  if (task.owner === '' && task.rolled === 0) return null
  return (
    <Box flexDirection="row" gap={1} paddingLeft={2}>
      {task.owner !== '' && <Text dimColor>{task.owner}</Text>}
      {owner?.percent !== undefined && (
        <Text color={isOverLimit ? 'warning' : undefined} dimColor={!isOverLimit}>{percentText(owner)}</Text>
      )}
      {task.rolled > 0 && <Text dimColor>↻{task.rolled}</Text>}
    </Box>
  )
}

function TeamLine({ ui, team, limit }: { ui: Ui; team: Teammate[]; limit: number }) {
  const { Box, Text } = ui
  if (team.length === 0) return null
  return (
    <Box flexDirection="row" columnGap={2} flexWrap="wrap" marginTop={1}>
      <Text dimColor>Team</Text>
      {team.map(mate => (
        <Text color={isFull(mate, limit) ? 'warning' : undefined}>{mate.name} {percentText(mate)}</Text>
      ))}
    </Box>
  )
}

type ActionBarProps = { ui: Ui; task: Task; column: ColumnId; actions: BoardActions }

/** What can be done to the selected task; every button has its key. */
function ActionBar({ ui, task, column, actions }: ActionBarProps) {
  const { Box, Button, Text } = ui
  const back = stepTarget(column, -1)
  const forward = stepTarget(column, 1)
  return (
    <Box flexDirection="column">
      <Text bold wrap="truncate-end">{task.id}  {task.title}</Text>
      <Box flexDirection="row" columnGap={2} flexWrap="wrap">
        {back && <Button key="back" plain hotkey="h" label={`◀ ${TITLES[back]}`} onPress={() => actions.move(task, column, back)} />}
        {forward && <Button key="forward" plain hotkey="l" label={`${TITLES[forward]} ▶`} onPress={() => actions.move(task, column, forward)} />}
        <Button key="open" plain hotkey="o" label="Open" onPress={() => actions.open(task)} />
        {task.status === 'todo' && <Button key="start" plain hotkey="s" label="Start" onPress={() => actions.start(task)} />}
        {column !== 'done' && <Button key="done" plain hotkey="d" label="Done" onPress={() => actions.done(task)} />}
      </Box>
    </Box>
  )
}

type NavBarProps = { ui: Ui; view: View; hasSelection: boolean; actions: BoardActions }

function NavBar({ ui, view, hasSelection, actions }: NavBarProps) {
  const { Box, Button, Text } = ui
  return (
    <Box flexDirection="row" columnGap={2} flexWrap="wrap">
      <Button key="view" plain hotkey="v" dimColor label={view === 'table' ? 'Kanban' : 'Table'} onPress={actions.toggleView} />
      <Button key="config" plain hotkey="c" dimColor label="Config" onPress={actions.showConfig} />
      <Text dimColor>{hasSelection ? '↑↓ select · enter open' : '↑↓ select a task'}</Text>
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
