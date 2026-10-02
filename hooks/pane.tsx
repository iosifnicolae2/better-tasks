import { atom, read, update } from 'claude-code'
import type { CommandPresentation, CommandSpec, EngineInterface, On, PluginOptions } from 'claude-code'

import type { Task, Teammate, When } from '../types'
import { Board, Header, sectionsOf, stepId } from './board'
import type { BoardActions } from './board'
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
import { listTasks, today, whenOf } from './tasks'
import { isActive } from './team'

// The Sprint pane: /sprint opens the board, /sprint config its settings page. This file holds `$`.
// (/tasks is Claude Code's own command, so the pane cannot take that name.)

const PANE = 'supermanager-sprint'
const REFRESH_MS = 30_000
const DOCK_COLUMNS = 76
const NATIVE_PREFIX = 'Supermanager: '

/** register.tsx registers these at session start; this file answers them. */
export const PANE_COMMANDS: CommandSpec[] = [
  { name: 'sprint', description: 'Show the sprint board in a pane', argumentHint: '[config]' },
]

// The values the pane draws from; the validator wants them declared in the file that uses them.
const tasksState = atom({ plugin: 'supermanager', key: 'tasks' } as const, [] as Task[])
const teamState = atom({ plugin: 'supermanager', key: 'team' } as const, [] as Teammate[])
const selectedState = atom({ plugin: 'supermanager', key: 'selected' } as const, '')
const menuState = atom({ plugin: 'supermanager', key: 'menu' } as const, '')
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

/** A click or Enter on a task selects it and opens its menu; on the open one, closes it. */
async function pressTask($: EngineInterface, task: Task): Promise<void> {
  await update($, selectedState, () => task.id)
  await update($, menuState, menu => (menu === task.id ? '' : task.id))
}

/** j/k: selects the task, closes the menu and moves the focus ring onto it. */
async function selectTask($: EngineInterface, id: string | undefined): Promise<void> {
  if (id === undefined) return
  await update($, selectedState, () => id)
  await update($, menuState, () => '')
  // Best effort: the ring only moves while the pane holds the keys.
  await $.ui.focus({ requestId: PANE, key: `task-${id}` }).catch(() => undefined)
}

let refreshTimer: { cancel: () => void } | undefined

async function openPane($: EngineInterface, page: 'board' | 'config'): Promise<void> {
  const files = filesOf($)
  await listTasks(files)
  refreshTimer ??= $.clock.every(REFRESH_MS, () => void listTasks(files))
  await update($, pageState, () => page)
  await $.ui.open({ id: PANE, title: 'Sprint', focus: true, columns: DOCK_COLUMNS })
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

  on('command.run', { command: 'sprint' }, async ($, e) => {
    const page = e.args.trim() === 'config' ? 'config' : 'board'
    await openPane($, page)
    return { text: `Sprint board opened.${dockTip(e.presentation)}` }
  })

  // In Claude Code's own /config menu our rows read "Supermanager: …", so they are easy to find.
  on('config.describe', { key: /^supermanager\./ }, async ($, e, next) => {
    const described = await next(e)
    return described.label.startsWith(NATIVE_PREFIX) ? described : { ...described, label: NATIVE_PREFIX + described.label }
  })

  // Selection follows the focus ring, so the arrow keys select; another task closes the menu.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const moved = await next(e)
    const id = e.element?.match(/^task-(.+)$/)?.[1]
    if (id === undefined || moved.deny !== undefined) return moved
    await update($, selectedState, () => id)
    await update($, menuState, menu => (menu === id ? menu : ''))
    return moved
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box } = ui
    const files = filesOf($)
    const tasks = await read($, tasksState)
    const team = (await read($, teamState)).filter(isActive)
    const selectedId = await read($, selectedState)
    const menuId = await read($, menuState)
    const page = await read($, pageState)
    const day = await today(files)
    const current = sprintStart(day, settings.sprint)
    const goal = goalOf(await readSprints(files), current)
    const sprintsFile = `${await $.session.root()}/${SPRINTS_FILE}`

    const sections = sectionsOf(tasks, day, settings.sprint)
    const inSprint = tasks.filter(task => task.sprint === current && task.status !== 'cancelled')
    const doneCount = inSprint.filter(task => task.status === 'done').length
    const order = sections.flatMap(section => section.tasks.map(task => task.id))
    const selectedTask = sections.flatMap(section => section.tasks).find(task => task.id === selectedId)
    const selected = selectedTask && { task: selectedTask, when: whenOf(selectedTask, day, settings.sprint) }
    const showPage = (to: 'board' | 'config') => () => void update($, pageState, () => to)
    const closeMenu = () => update($, menuState, () => '')

    const actions: BoardActions = {
      pressTask: task => void pressTask($, task),
      selectStep: step => void selectTask($, stepId(order, selectedTask?.id, step)),
      move: (task: Task, to: When) => void changeTask(files, task, { when: to }, settings.sprint).then(closeMenu),
      open: task => void openFile($, settings.editor, task.file).then(closeMenu),
      start: task => void $.prompt.submit({ text: startPrompt(task) }).then(closeMenu),
      done: task => void finishTask(files, task, {}, settings.sprint).then(closeMenu),
      showConfig: showPage('config'),
    }

    return (
      <Box flexDirection="column" paddingX={1}>
        <Header ui={ui} label={sprintLabel(current, settings.sprint)} goal={goal} done={doneCount} total={inSprint.length} />
        {page === 'config' ? (
          <Box marginTop={1}>
            <ConfigPage ui={ui} settings={settings}
              onChange={(field, value) => void setConfig($, field, value)}
              onOpenNative={() => void $.command.run({ command: 'config' })}
              onOpenSprints={() => void openFile($, settings.editor, sprintsFile)}
              onBack={showPage('board')} />
          </Box>
        ) : (
          <Board ui={ui} sections={sections} doneCount={doneCount} selected={selected} menuId={menuId}
            team={team} limit={settings.contextLimit} actions={actions} />
        )}
      </Box>
    )
  })
}
