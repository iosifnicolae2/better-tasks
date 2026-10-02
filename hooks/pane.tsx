import { atom, read, update } from 'claude-code'
import type { CommandPresentation, CommandSpec, EngineInterface, On, PluginOptions } from 'claude-code'

import type { Task, Teammate, When } from '../types'
import { Board, Header, columnOf, columnsOf } from './board'
import type { BoardActions, ColumnId, View } from './board'
import { ConfigPage } from './configpage'
import type { ConfigValue } from './configpage'
import { openCommand } from './editor'
import type { HostApp } from './editor'
import type { Files } from './io'
import { settingsOf } from './settings'
import type { Editor } from './settings'
import { SPRINTS_FILE, goalOf, readSprints } from './sprintlog'
import { sprintLabel, sprintStart } from './sprints'
import { changeTask, finishTask, startPrompt } from './taskflow'
import { listTasks, today } from './tasks'
import { isActive } from './team'

// The Tasks pane: /tasks opens the board, /tasks config its settings page. This file holds `$`.

const PANE = 'supermanager-tasks'
const REFRESH_MS = 30_000
const DOCK_COLUMNS = 76
const VIEW_KEY = 'pane.view'

/** register.tsx registers these at session start; this file answers them. */
export const PANE_COMMANDS: CommandSpec[] = [
  { name: 'tasks', description: 'Show the sprint board in a pane', argumentHint: '[config]' },
]

// The values the pane draws from; the validator wants them declared in the file that uses them.
const tasksState = atom({ plugin: 'supermanager', key: 'tasks' } as const, [] as Task[])
const teamState = atom({ plugin: 'supermanager', key: 'team' } as const, [] as Teammate[])
const selectedState = atom({ plugin: 'supermanager', key: 'selected' } as const, '')
const viewState = atom({ plugin: 'supermanager', key: 'view' } as const, 'table' as View)
const pageState = atom({ plugin: 'supermanager', key: 'page' } as const, 'board' as 'board' | 'config')

// ---- With $ ----

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

async function hostOf($: EngineInterface, editor: Editor): Promise<HostApp> {
  const needsIdeaCli = editor === 'idea' || editor === 'auto'
  return {
    bundleId: await $.env.get('__CFBundleIdentifier'),
    terminalEmulator: await $.env.get('TERMINAL_EMULATOR'),
    termProgram: await $.env.get('TERM_PROGRAM'),
    hasIdeaCli: needsIdeaCli && (await $.process.run(['which', 'idea'])).exitCode === 0,
  }
}

async function openFile($: EngineInterface, editor: Editor, file: string): Promise<void> {
  await $.process.run(openCommand(editor, file, await hostOf($, editor)))
}

async function setConfig($: EngineInterface, field: string, value: ConfigValue): Promise<void> {
  await $.config.set({ key: `supermanager.${field}`, value })
}

async function setView($: EngineInterface, view: View): Promise<void> {
  await update($, viewState, () => view)
  await $.store.set(VIEW_KEY, view)
}

let refreshTimer: { cancel: () => void } | undefined

async function openPane($: EngineInterface, page: 'board' | 'config'): Promise<void> {
  const files = filesOf($)
  await listTasks(files)
  refreshTimer ??= $.clock.every(REFRESH_MS, () => void listTasks(files))
  const stored = await $.store.get(VIEW_KEY)
  if (stored === 'table' || stored === 'kanban') await update($, viewState, () => stored)
  await update($, pageState, () => page)
  await $.ui.open({ id: PANE, title: 'Tasks', focus: true, columns: DOCK_COLUMNS })
}

function dockTip(presentation: CommandPresentation): string {
  if (!presentation.isFullscreen) {
    return ' It opened above the prompt; the fullscreen layout docks it on the right (needs 110+ columns).'
  }
  if (presentation.columns < 110) return ' Widen the terminal to 110+ columns to dock it on the right.'
  return ''
}

// ---- Wiring ----

export function registerPane(on: On, options: PluginOptions): void {
  const settings = settingsOf(options)

  on('command.run', { command: 'tasks' }, async ($, e) => {
    const page = e.args.trim() === 'config' ? 'config' : 'board'
    await openPane($, page)
    return { text: `Tasks pane opened.${dockTip(e.presentation)}` }
  })

  // Selection follows the focus ring, so the arrow keys select.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const moved = await next(e)
    const card = e.element?.match(/^card-(.+)$/)?.[1]
    if (card !== undefined && moved.deny === undefined) await update($, selectedState, () => card)
    return moved
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box } = ui
    const files = filesOf($)
    const tasks = await read($, tasksState)
    const team = (await read($, teamState)).filter(isActive)
    const selectedId = await read($, selectedState)
    const view = await read($, viewState)
    const page = await read($, pageState)
    const day = await today(files)
    const current = sprintStart(day, settings.sprint)
    const goal = goalOf(await readSprints(files), current)
    const sprintsFile = `${await $.session.root()}/${SPRINTS_FILE}`

    const columns = columnsOf(tasks, day, settings.sprint, current)
    const inSprint = tasks.filter(task => task.sprint === current && task.status !== 'cancelled')
    const shown = columns.flatMap(column => column.tasks)
    const selectedTask = shown.find(task => task.id === selectedId)
    const selected = selectedTask && { task: selectedTask, column: columnOf(selectedTask, day, settings.sprint) }
    const showPage = (to: 'board' | 'config') => () => void update($, pageState, () => to)

    const actions: BoardActions = {
      pressCard: (task, isSelected) =>
        void (isSelected ? openFile($, settings.editor, task.file) : update($, selectedState, () => task.id)),
      move: (task: Task, from: ColumnId, to: When) =>
        void changeTask(files, task, from === 'done' ? { status: 'todo', when: to } : { when: to }, settings.sprint),
      open: task => void openFile($, settings.editor, task.file),
      start: task => void $.prompt.submit({ text: startPrompt(task) }),
      done: task => void finishTask(files, task, {}, settings.sprint),
      toggleView: () => void setView($, view === 'table' ? 'kanban' : 'table'),
      showConfig: showPage('config'),
    }

    return (
      <Box flexDirection="column" paddingX={1}>
        <Header ui={ui} label={sprintLabel(current, settings.sprint)} goal={goal}
          done={inSprint.filter(task => task.status === 'done').length} total={inSprint.length} />
        {page === 'config' ? (
          <Box marginTop={1}>
            <ConfigPage ui={ui} settings={settings}
              onChange={(field, value) => void setConfig($, field, value)}
              onOpenSprints={() => void openFile($, settings.editor, sprintsFile)}
              onBack={showPage('board')} />
          </Box>
        ) : (
          <Board ui={ui} view={view} columns={columns} selected={selected} team={team}
            limit={settings.contextLimit} actions={actions} />
        )}
      </Box>
    )
  })
}
