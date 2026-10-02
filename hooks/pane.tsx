import { atom, read, update } from 'claude-code'
import type { CommandPresentation, CommandSpec, EngineInterface, On, PluginOptions } from 'claude-code'

import type { Task, Teammate, When } from '../types'
import { Board, Header, sectionsOf, shifted, stepId } from './board'
import type { BoardActions, Section } from './board'
import { ConfigPage } from './configpage'
import { SessionView, linesOf } from './sessionview'
import type { ConfigValue } from './configpage'
import { openCommand } from './editor'
import type { HostApp } from './editor'
import type { Files } from './io'
import { projectSettings, readOverrides, settingsFrom } from './settings'
import type { Editor } from './settings'
import { goalOf, readSprints } from './sprintlog'
import { sprintLabel, sprintStart } from './sprints'
import type { SprintConfig } from './sprints'
import { changeTask, finishTask, startPrompt } from './taskflow'
import { listTasks, placeOf, saveTask, today, whenOf } from './tasks'
import { isActive } from './team'

// The Supermanager pane: /supermanager opens the board, /supermanager config its settings page. This file holds `$`.
// (/tasks is Claude Code's own command, so the pane cannot take that name.)

const PANE = 'supermanager-sprint'
const REFRESH_MS = 30_000
const FOCUS_RETRY_MS = 150
const PANE_OPEN = { id: PANE, title: 'Sprint', focus: true, columns: 76 } as const
const NATIVE_PREFIX = 'Supermanager: '

type Page = 'board' | 'config' | 'session'

/** register.tsx registers these at session start; this file answers them. */
export const PANE_COMMANDS: CommandSpec[] = [
  { name: 'supermanager', description: 'Show the sprint board in a pane', argumentHint: '[config]' },
]

// The values the pane draws from; the validator wants them declared in the file that uses them.
const tasksState = atom({ plugin: 'supermanager', key: 'tasks' } as const, [] as Task[])
const teamState = atom({ plugin: 'supermanager', key: 'team' } as const, [] as Teammate[])
const selectedState = atom({ plugin: 'supermanager', key: 'selected' } as const, '')
const pageState = atom({ plugin: 'supermanager', key: 'page' } as const, 'board' as Page)
const viewingState = atom({ plugin: 'supermanager', key: 'viewing' } as const, '')

// ---- With $ ----

/** The task files of the session's project, with its settings (/config, then its config.json). */
function filesOf($: EngineInterface, options: PluginOptions): Files {
  const files: Files = {
    root: () => $.session.root(),
    now: () => $.clock.now(),
    sessionId: () => $.session.id(),
    read: path => $.fs.read(path),
    write: (path, text) => $.fs.write(path, text),
    list: path => $.fs.list(path),
    publishTasks: tasks => update($, tasksState, () => tasks),
    config: () => projectSettings(files, options),
  }
  return files
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


/** The teammate page: a live look at its session, with how to switch Claude Code's own view to it. */
async function viewSession($: EngineInterface, agentId: string): Promise<void> {
  await update($, viewingState, () => agentId)
  await update($, pageState, () => 'session')
}

/** Selects the task and keeps the focus ring on it (best effort: only while the pane holds the keys). */
async function selectTask($: EngineInterface, id: string | undefined): Promise<void> {
  if (id === undefined) return
  await update($, selectedState, () => id)
  await $.ui.focus({ requestId: PANE, key: `task-${id}` }).catch(() => undefined)
}

/**
 * ⌥↑/⌥↓: one place up or down, across into the next section at an edge. Every task of the
 * section it lands in is renumbered, so the order in the files is the order on screen.
 */
async function shiftTask(files: Files, sections: Section[], task: Task, step: -1 | 1, config: SprintConfig): Promise<void> {
  const moved = shifted(sections, task.id, step)
  if (moved === undefined) return
  const day = await today(files)
  const all = sections.flatMap(section => section.tasks)
  for (const [order, id] of moved.ids.entries()) {
    const one = all.find(candidate => candidate.id === id)
    if (one === undefined) continue
    const place = id === task.id ? placeOf(moved.when, day, config) : {}
    const next = { ...one, ...place, order }
    if (next.order !== one.order || next.sprint !== one.sprint || next.urgent !== one.urgent) await saveTask(files, next)
  }
}

let refreshTimer: { cancel: () => void } | undefined

async function openPane($: EngineInterface, options: PluginOptions, page: Page): Promise<void> {
  const files = filesOf($, options)
  await listTasks(files)
  refreshTimer ??= $.clock.every(REFRESH_MS, () => void listTasks(files))
  await update($, pageState, () => page)
  await $.ui.open(PANE_OPEN)
  // The pane only takes the keys while the prompt holds them over an empty composer, which the
  // command's own run may not leave in time; ask once more right after it.
  $.clock.after(FOCUS_RETRY_MS, () => void $.ui.open(PANE_OPEN))
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

  on('command.run', { command: 'supermanager' }, async ($, e) => {
    const page = e.args.trim() === 'config' ? 'config' : 'board'
    await openPane($, options, page)
    return { text: `Sprint board opened. If its keys do nothing, ctrl+x tab gives it the keyboard.${dockTip(e.presentation)}` }
  })

  // In Claude Code's own /config menu our rows read "Supermanager: …", so they are easy to find.
  on('config.describe', { key: /^supermanager\./ }, async ($, e, next) => {
    const described = await next(e)
    return described.label.startsWith(NATIVE_PREFIX) ? described : { ...described, label: NATIVE_PREFIX + described.label }
  })

  // A closed pane needs no refresh; the spinners stop with their rows.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    refreshTimer?.cancel()
    refreshTimer = undefined
    return next(e)
  })

  // Selection follows the focus ring, so the arrow keys select.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const moved = await next(e)
    const id = e.element?.match(/^task-(.+)$/)?.[1]
    if (id !== undefined && moved.deny === undefined) await update($, selectedState, () => id)
    return moved
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box } = ui
    const files = filesOf($, options)
    const settings = await settingsFrom(files)
    const tasks = await read($, tasksState)
    const viewing = await read($, viewingState)
    const everyone = await read($, teamState)
    const team = everyone.filter(isActive)
    const page = await read($, pageState)
    const showPage = (to: Page) => () => void update($, pageState, () => to)

    if (page === 'session') {
      const mate = everyone.find(one => one.id === viewing)
      const task = tasks.find(one => mate !== undefined && one.owner === mate.name && one.status === 'doing')
      const found = mate && (await $.session.messages({ agentId: mate.id }))
      const lines = found === undefined || 'deny' in found ? 'Its session cannot be read from here.' : linesOf(found)
      return <SessionView ui={ui} mate={mate} task={task} lines={lines} limit={settings.contextLimit} onBack={showPage('board')} />
    }

    const selectedId = await read($, selectedState)
    const day = await today(files)
    const current = sprintStart(day, settings.sprint)
    const goal = goalOf(await readSprints(files), current)
    const sprintsFile = `${await $.session.root()}/${settings.paths.sprints}`
    const fromProject = Object.keys((await readOverrides(files)).values)

    const sections = sectionsOf(tasks, day, settings.sprint)
    const inSprint = tasks.filter(task => task.sprint === current && task.status !== 'cancelled')
    const doneCount = inSprint.filter(task => task.status === 'done').length
    const order = sections.flatMap(section => section.tasks.map(task => task.id))
    const shown = sections.flatMap(section => section.tasks)
    // Always a selection while there are tasks, so the detail area and ⌥↑/⌥↓ work from the start.
    const selectedTask = shown.find(task => task.id === selectedId) ?? shown[0]
    const selected = selectedTask && {
      task: selectedTask,
      when: whenOf(selectedTask, day, settings.sprint),
      mate: team.find(one => one.name === selectedTask.owner),
    }
    const keepFocus = (id: string | undefined) => () => selectTask($, id)
    const nextAfter = (id: string) => order[order.indexOf(id) + 1] ?? order[order.indexOf(id) - 1]

    const actions: BoardActions = {
      pressTask: (task, isSelected) => void (isSelected ? openFile($, settings.editor, task.file) : selectTask($, task.id)),
      selectStep: step => void selectTask($, stepId(order, selectedTask?.id, step)),
      shift: (task, step) => void shiftTask(files, sections, task, step, settings.sprint).then(keepFocus(task.id)),
      move: (task: Task, to: When) => void changeTask(files, task, { when: to }, settings.sprint).then(keepFocus(task.id)),
      open: task => void openFile($, settings.editor, task.file),
      start: task => void $.prompt.submit({ text: startPrompt(task) }),
      done: task => void finishTask(files, task, {}, settings.sprint).then(keepFocus(nextAfter(task.id))),
      view: mate => void viewSession($, mate.id),
      showConfig: showPage('config'),
    }

    return (
      <Box flexDirection="column" paddingX={1}>
        <Header ui={ui} label={sprintLabel(current, settings.sprint)} goal={goal} done={doneCount} total={inSprint.length} />
        {page === 'config' ? (
          <Box marginTop={1}>
            <ConfigPage ui={ui} settings={settings} fromProject={fromProject}
              onChange={(field, value) => void setConfig($, field, value)}
              onOpenNative={() => void $.command.run({ command: 'config' })}
              onOpenSprints={() => void openFile($, settings.editor, sprintsFile)}
              onBack={showPage('board')} />
          </Box>
        ) : (
          <Board ui={ui} sections={sections} doneCount={doneCount} selected={selected} team={team}
            limit={settings.contextLimit} hasKeys={e.props.isFocused} actions={actions} />
        )}
      </Box>
    )
  })
}
