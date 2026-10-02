import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { columnsOf, stepTarget } from '../hooks/board'
import { openCommand } from '../hooks/editor'
import type { HostApp } from '../hooks/editor'
import { parseTask } from '../hooks/tasks'

const ROOT = '/project'
const DIR = `${ROOT}/.claude/manager/tasks`
const WEDNESDAY = new Date(2026, 9, 7, 12).getTime()
const SURFACES = ['terminal', 'desktop'] as const

const PANE = {
  component: 'Pane',
  requestId: 'supermanager-tasks',
  props: {
    title: 'Tasks',
    isFocused: true,
    bodyColumns: 76,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

function taskFile(id: string, title: string, sprint: string, status: string, owner = '', rolled = 0): string {
  return [
    '---',
    `id: ${id}`,
    `title: ${title}`,
    `sprint: ${sprint}`,
    'urgent: false',
    `status: ${status}`,
    `owner: ${owner}`,
    `rolled: ${rolled}`,
    'created: 2026-10-03',
    '---',
    '## Goal\nIt works.\n\n## Notes\n',
  ].join('\n')
}

const FILES: Record<string, string> = {
  [`${DIR}/T-001-fix-login.md`]: taskFile('T-001', 'Fix login', '2026-10-05', 'todo', 'auth', 1),
  [`${DIR}/T-002-dark-mode.md`]: taskFile('T-002', 'Dark mode', 'backlog', 'todo'),
  [`${DIR}/T-003-old-bug.md`]: taskFile('T-003', 'Old bug', '2026-10-05', 'done'),
}

/** A project of three tasks on disk, and a record of every command run and setting written. */
function fakeProject(on: On, env: Record<string, string> = {}, stored: Record<string, unknown> = {}) {
  const files = new Map(Object.entries(FILES))
  const commands: string[][] = []
  const settings: [string, unknown][] = []
  mock.clock(on, { now: WEDNESDAY })
  mock.store(on, stored)
  mock.env(on, env)
  on('session.root', () => ({ value: ROOT }))
  on('session.id', () => ({ value: 'test-session' }))
  on('fs.list', ($, e) => ({
    value: [...files.keys()]
      .filter(path => path.startsWith(`${e.path}/`))
      .map(path => ({ name: path.slice(e.path.length + 1), kind: 'file' as const, size: 0, mtimeMs: 0, isLink: false })),
  }))
  on('fs.read', ($, e) => {
    const text = files.get(e.path)
    return text === undefined ? { deny: `no such file: ${e.path}` } : { value: text }
  })
  on('fs.write', ($, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('process.run', ($, e) => {
    commands.push([...e.argv])
    return { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('config.set', ($, e) => {
    settings.push([e.key, e.value])
    return { value: e.value }
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  return { files, commands, settings }
}

const tasksCommand = (args = '') => ({
  command: 'tasks',
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: true, columns: 160 },
})

// ---- Pure ----

test('the editor setting picks the command', () => {
  const plain: HostApp = { hasIdeaCli: false }
  expect(openCommand('default', '/a.md', plain)).toEqual(['open', '/a.md'])
  expect(openCommand('code', '/a.md', plain)).toEqual(['code', '/a.md'])
  expect(openCommand('idea', '/a.md', { hasIdeaCli: true })).toEqual(['idea', '/a.md'])
  expect(openCommand('idea', '/a.md', plain)).toEqual(['open', '-a', 'IntelliJ IDEA', '/a.md'])
  expect(openCommand('zed', '/a.md', plain)).toEqual(['zed', '/a.md'])
})

test('auto opens the IDE Claude runs inside', () => {
  const intellij = { bundleId: 'com.jetbrains.intellij', terminalEmulator: 'JetBrains-JediTerm', hasIdeaCli: false }
  expect(openCommand('auto', '/a.md', intellij)).toEqual(['open', '-b', 'com.jetbrains.intellij', '/a.md'])
  expect(openCommand('auto', '/a.md', { terminalEmulator: 'JetBrains-JediTerm', hasIdeaCli: true })).toEqual(['idea', '/a.md'])
  expect(openCommand('auto', '/a.md', { termProgram: 'vscode', hasIdeaCli: false })).toEqual(['code', '/a.md'])
  expect(openCommand('auto', '/a.md', { bundleId: 'com.apple.Terminal', hasIdeaCli: false })).toEqual(['open', '/a.md'])
})

test('columns and moves', () => {
  const tasks = Object.entries(FILES).map(([file, text]) => parseTask(text, file))
  const columns = columnsOf(tasks, '2026-10-07', { weeks: 1, startDay: 1 }, '2026-10-05')
  expect(columns.map(column => [column.id, column.tasks.map(task => task.id)])).toEqual([
    ['now', []],
    ['this-sprint', ['T-001']],
    ['next-sprint', []],
    ['backlog', ['T-002']],
    ['done', ['T-003']],
  ])
  expect(stepTarget('now', -1)).toBeUndefined()
  expect(stepTarget('this-sprint', 1)).toBe('next-sprint')
  expect(stepTarget('backlog', 1)).toBeUndefined()
  expect(stepTarget('done', -1)).toBe('this-sprint')
})

// ---- The pane ----

test('both views select, move, open and finish a task', async ($, on) => {
  const { files, commands } = fakeProject(on)
  await $.command.run(tasksCommand())

  for (const surface of SURFACES) {
    for (const view of ['table', 'kanban'] as const) {
      const ui = await $.ui.mount({ plugin: 'supermanager', surface, ...PANE })
      if ((await ui.find({ key: 'view' }))?.text !== (view === 'table' ? 'Kanban' : 'Table')) await ui.press({ key: 'view' })
      expect(await ui.find({ type: 'Text', text: 'Sprint 41 · Oct 5–11' })).toBeDefined()
      expect(await ui.find({ key: 'card-T-002' })).toBeDefined()
      expect((await ui.find({ key: 'card-T-003' })) !== undefined).toBe(view === 'kanban')

      await ui.press({ key: 'card-T-002' })
      expect((await ui.find({ key: 'back' }))?.text).toContain('Next sprint')
      await ui.press({ key: 'back' })
      expect(files.get(`${DIR}/T-002-dark-mode.md`)).toContain('sprint: 2026-10-12')
      await ui.press({ key: 'forward' })
      expect(files.get(`${DIR}/T-002-dark-mode.md`)).toContain('sprint: backlog')

      commands.length = 0
      await ui.press({ key: 'card-T-002' })
      expect(commands.at(-1)).toEqual(['open', `${DIR}/T-002-dark-mode.md`])
      await ui.unmount()
    }
  }

  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'terminal', ...PANE })
  await ui.press({ key: 'card-T-001' })
  await ui.press({ key: 'done' })
  expect(files.get(`${DIR}/T-001-fix-login.md`)).toContain('status: done')
  expect(await ui.find({ type: 'Text', text: '2/2 done' })).toBeDefined()
  expect(files.get(`${ROOT}/docs/tasks.md`)).toContain('T-001 Fix login')
})

test('the pane opens in the view picked last time', async ($, on) => {
  fakeProject(on, {}, { 'pane.view': 'kanban' })
  await $.command.run(tasksCommand())
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'terminal', ...PANE })
  expect((await ui.find({ key: 'view' }))?.text).toBe('Table')
  expect(await ui.find({ key: 'card-T-003' })).toBeDefined()
})

test('inside IntelliJ, Open uses the running IDE', async ($, on) => {
  const { commands } = fakeProject(on, { __CFBundleIdentifier: 'com.jetbrains.intellij', TERMINAL_EMULATOR: 'JetBrains-JediTerm' })
  await $.command.run(tasksCommand())
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'desktop', ...PANE })
  await ui.press({ key: 'card-T-001' })
  await ui.press({ key: 'open' })
  expect(commands.at(-1)).toEqual(['open', '-b', 'com.jetbrains.intellij', `${DIR}/T-001-fix-login.md`])
})

test('/tasks config shows the settings page and writes the settings', async ($, on) => {
  const { settings } = fakeProject(on)
  await $.command.run(tasksCommand('config'))
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'supermanager', surface, ...PANE })
    expect(await ui.find({ key: 'card-T-001' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'Context limit' })).toBeDefined()
    await ui.select({ key: 'editor', value: 'code' })
    await ui.select({ key: 'worktree', value: 'on' })
    await ui.select({ key: 'contextLimit', value: '60' })
    await ui.unmount()
  }
  expect(settings.slice(0, 3)).toEqual([
    ['supermanager.editor', 'code'],
    ['supermanager.worktree', true],
    ['supermanager.contextLimit', 60],
  ])
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'terminal', ...PANE })
  await ui.press({ key: 'board' })
  expect(await ui.find({ key: 'card-T-001' })).toBeDefined()
})

test('the phone draws the board and settings without pickers', async ($, on) => {
  fakeProject(on)
  await $.command.run(tasksCommand())
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'mobile', ...PANE })
  await ui.press({ key: 'card-T-001' })
  expect(await ui.find({ key: 'done' })).toBeDefined()
  await ui.press({ key: 'config' })
  expect(await ui.find({ type: 'Text', text: 'auto' })).toBeDefined()
})

test('the arrow keys select: the focus ring carries the selection', async ($, on) => {
  fakeProject(on)
  on('ui.focus', () => ({}))
  await $.command.run(tasksCommand())
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'terminal', ...PANE })
  const moved = await $.ui.focus({
    component: 'Pane',
    requestId: 'supermanager-tasks',
    plugin: 'supermanager',
    element: 'card-T-002',
    origin: { kind: 'person' },
  })
  expect(moved.deny).toBeUndefined()
  expect((await ui.find({ key: 'card-T-002' }))?.text).toContain('›')
})
