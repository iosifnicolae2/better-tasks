import { atom, read, update } from 'claude-code'
import type { CommandSpec, ElementTable, EngineInterface, On, PluginOptions } from 'claude-code'

import type { Task, Teammate, When } from '../types'
import type { Files } from './io'
import { settingsOf } from './settings'
import type { Editor, Settings } from './settings'
import { SPRINTS_FILE, goalOf, readSprints } from './sprintlog'
import { sprintLabel, sprintStart } from './sprints'
import { changeTask, finishTask, startPrompt } from './taskflow'
import { isOpen, listTasks, today, whenOf } from './tasks'
import { isActive, isFull } from './team'

// The Tasks pane: /tasks opens it; it redraws whenever tasks or team change.

const PANE = 'supermanager-tasks'

/** register.tsx registers these at session start; this file answers them. */
export const PANE_COMMANDS: CommandSpec[] = [{ name: 'tasks', description: 'Show the tasks of this sprint in a pane' }]
const REFRESH_MS = 30_000

// The values the pane draws from; the validator wants them declared in the file that uses them.
const tasksState = atom({ plugin: 'supermanager', key: 'tasks' } as const, [] as Task[])
const teamState = atom({ plugin: 'supermanager', key: 'team' } as const, [] as Teammate[])
const selectedState = atom({ plugin: 'supermanager', key: 'selected' } as const, '')

const SECTIONS: readonly { when: When; title: string }[] = [
  { when: 'now', title: 'Now' },
  { when: 'this-sprint', title: 'This sprint' },
  { when: 'next-sprint', title: 'Next sprint' },
  { when: 'backlog', title: 'Backlog' },
]

const EDITORS: readonly Editor[] = ['default', 'code', 'idea', 'cursor', 'zed']
const LIMITS = ['30', '40', '50', '60', '70', '80']
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

type Ui = ElementTable

// ---- Pure ----

/** The command that opens `file` in the chosen editor. */
export function openCommand(editor: Editor, file: string, hasIdeaCli: boolean): string[] {
  if (editor === 'default') return ['open', file]
  if (editor === 'idea' && !hasIdeaCli) return ['open', '-a', 'IntelliJ IDEA', file]
  return [editor, file]
}

export function percentText(teammate: Teammate | undefined): string {
  return teammate?.percent === undefined ? '' : `${Math.round(teammate.percent)}%`
}

// ---- Actions ----

function filesOf($: EngineInterface): Files {
  return {
    root: () => $.session.root(),
    now: () => $.clock.now(),
    sessionId: () => $.session.id(),
    read: path => $.fs.read(path),
    write: (path, text) => $.fs.write(path, text),
    list: path => $.fs.list(path),
    publishTasks: tasks => update($, tasksState, () => tasks),
  }
}

async function openFile($: EngineInterface, editor: Editor, file: string): Promise<void> {
  const hasIdeaCli = editor === 'idea' && (await $.process.run(['which', 'idea'])).exitCode === 0
  await $.process.run(openCommand(editor, file, hasIdeaCli))
}

type ConfigValue = string | number | boolean
type SetConfig = (field: string, value: ConfigValue) => void

async function setConfig($: EngineInterface, field: string, value: ConfigValue): Promise<void> {
  await $.config.set({ key: `supermanager.${field}`, value })
}

let refreshTimer: { cancel: () => void } | undefined

async function openPane($: EngineInterface): Promise<void> {
  const files = filesOf($)
  await listTasks(files)
  refreshTimer ??= $.clock.every(REFRESH_MS, () => void listTasks(files))
  await $.ui.open({ id: PANE, title: 'Tasks' })
}

// ---- Drawing ----

type RowProps = {
  ui: Ui
  task: Task
  owner?: Teammate
  limit: number
  isSelected: boolean
  onSelect: () => void
}

function TaskRow({ ui, task, owner, limit, isSelected, onSelect }: RowProps) {
  const { Box, Text, Button } = ui
  const isOverLimit = owner !== undefined && isFull(owner, limit)
  return (
    <Box flexDirection="row" gap={1}>
      <Text color="suggestion">{isSelected ? '›' : ' '}</Text>
      <Box flexGrow={1} flexShrink={1}>
        <Button key={`row-${task.id}`} plain label={`${task.id}  ${task.title}`} onPress={onSelect} />
      </Box>
      {task.status === 'doing' && <Text dimColor>doing</Text>}
      {task.owner !== '' && <Text dimColor>{task.owner}</Text>}
      {owner?.percent !== undefined && <Text color={isOverLimit ? 'warning' : undefined} dimColor={!isOverLimit}>{percentText(owner)}</Text>}
      {task.rolled > 0 && <Text dimColor>↻{task.rolled}</Text>}
    </Box>
  )
}

type ActionsProps = {
  ui: Ui
  task: Task
  when: When
  onOpen: () => void
  onStart: () => void
  onMove: (when: When) => void
  onDone: () => void
}

function TaskActions({ ui, task, when, onOpen, onStart, onMove, onDone }: ActionsProps) {
  const { Box, Button } = ui
  const moveOptions = SECTIONS.map(section => ({ value: section.when, label: section.title }))
  return (
    <Box flexDirection="row" gap={1} paddingLeft={2} flexWrap="wrap">
      <Button key="open" hotkey="o" variant="primary" onPress={onOpen}>Open</Button>
      {task.status === 'todo' && <Button key="start" hotkey="s" onPress={onStart}>Start</Button>}
      <Button key="done" hotkey="d" onPress={onDone}>Done</Button>
      {'Select' in ui && (
        <ui.Select key="move" label="Move " options={moveOptions} value={when} onSelect={value => onMove(value as When)} />
      )}
    </Box>
  )
}

type HeaderProps = { ui: Ui; label: string; goal: string; done: number; total: number }

function Header({ ui, label, goal, done, total }: HeaderProps) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="row" columnGap={1} flexWrap="wrap">
      <Text bold>{label}</Text>
      {goal !== '' && <Text dimColor>· goal: {goal}</Text>}
      <Text dimColor>·</Text>
      <Text color="success">{done}/{total} done</Text>
    </Box>
  )
}

function Section({ ui, title, children }: { ui: Ui; title: string; children?: JSX.Children }) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold dimColor>{title.toUpperCase()}</Text>
      {children}
    </Box>
  )
}

function TeamLine({ ui, team, limit }: { ui: Ui; team: Teammate[]; limit: number }) {
  const { Box, Text } = ui
  if (team.length === 0) return <Text dimColor>No teammates running.</Text>
  return (
    <Box flexDirection="row" gap={2} flexWrap="wrap">
      <Text dimColor>Teammates</Text>
      {team.map(mate => (
        <Text color={isFull(mate, limit) ? 'warning' : undefined}>
          {mate.name} {percentText(mate)}
        </Text>
      ))}
    </Box>
  )
}

function ConfigRow({ ui, settings, onChange }: { ui: Ui; settings: Settings; onChange: SetConfig }) {
  if (!('Select' in ui)) return null
  const { Box, Select } = ui
  const options = (values: readonly string[]) => values.map(value => ({ value }))
  const limits = LIMITS.includes(String(settings.contextLimit)) ? LIMITS : [...LIMITS, String(settings.contextLimit)]
  return (
    <Box flexDirection="row" columnGap={2} flexWrap="wrap">
      <Select key="editor" label="Editor " options={options(EDITORS)} value={settings.editor}
        onSelect={value => onChange('editor', value)} />
      <Select key="worktree" label="Worktree " options={[{ value: 'off' }, { value: 'on' }]}
        value={settings.worktree ? 'on' : 'off'} onSelect={value => onChange('worktree', value === 'on')} />
      <Select key="limit" label="Limit " options={limits.map(value => ({ value, label: `${value}%` }))}
        value={String(settings.contextLimit)} onSelect={value => onChange('contextLimit', Number(value))} />
      <Select key="sprintWeeks" label="Sprint " options={[{ value: '1', label: '1 week' }, { value: '2', label: '2 weeks' }]}
        value={String(settings.sprint.weeks)} onSelect={value => onChange('sprintWeeks', value)} />
      <Select key="sprintStart" label="Starts " options={options(WEEKDAYS)}
        value={WEEKDAYS[(settings.sprint.startDay + 6) % 7]} onSelect={value => onChange('sprintStart', value)} />
    </Box>
  )
}

// ---- Wiring ----

export function registerPane(on: On, options: PluginOptions): void {
  const settings = settingsOf(options)

  on('command.run', { command: 'tasks' }, async $ => {
    await openPane($)
    return { text: 'Tasks pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const files = filesOf($)
    const tasks = await read($, tasksState)
    const team = (await read($, teamState)).filter(isActive)
    const selectedId = await read($, selectedState)
    const day = await today(files)
    const current = sprintStart(day, settings.sprint)
    const goal = goalOf(await readSprints(files), current)
    const sprintsFile = `${await $.session.root()}/${SPRINTS_FILE}`

    const inSprint = tasks.filter(task => task.sprint === current && task.status !== 'cancelled')
    const doneCount = inSprint.filter(task => task.status === 'done').length
    const ownerOf = (task: Task) => team.find(mate => mate.name === task.owner)
    const select = (task: Task) => () => void update($, selectedState, id => (id === task.id ? '' : task.id))
    const actionsFor = (task: Task, when: When) => (
      <TaskActions ui={ui} task={task} when={when}
        onOpen={() => void openFile($, settings.editor, task.file)}
        onStart={() => void $.prompt.submit({ text: startPrompt(task) })}
        onMove={to => void changeTask(files, task, { when: to }, settings.sprint).then(() => listTasks(files))}
        onDone={() => void finishTask(files, task, {}, settings.sprint).then(() => listTasks(files))} />
    )

    return (
      <Box flexDirection="column" paddingX={1}>
        <Header ui={ui} label={sprintLabel(current, settings.sprint)} goal={goal} done={doneCount} total={inSprint.length} />

        {SECTIONS.map(section => {
          const rows = tasks.filter(task => isOpen(task) && whenOf(task, day, settings.sprint) === section.when)
          if (rows.length === 0 && section.when !== 'this-sprint') return null
          return (
            <Section ui={ui} title={section.title}>
              {rows.length === 0 && <Text dimColor>  Nothing planned yet.</Text>}
              {rows.map(task => (
                <Box flexDirection="column">
                  <TaskRow ui={ui} task={task} owner={ownerOf(task)} limit={settings.contextLimit}
                    isSelected={task.id === selectedId} onSelect={select(task)} />
                  {task.id === selectedId && actionsFor(task, section.when)}
                </Box>
              ))}
            </Section>
          )
        })}

        <Section ui={ui} title={`Done this sprint · ${doneCount}`} />

        <Box flexDirection="column" marginTop={1} gap={1}>
          <TeamLine ui={ui} team={team} limit={settings.contextLimit} />
          <ConfigRow ui={ui} settings={settings} onChange={(field, value) => void setConfig($, field, value)} />
          <Box>
            <Button key="sprints" dimColor onPress={() => void openFile($, settings.editor, sprintsFile)}>
              Open sprints.md
            </Button>
          </Box>
        </Box>
      </Box>
    )
  })
}
