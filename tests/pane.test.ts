import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { sectionsOf, stepId } from '../hooks/board'
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
  on('ui.focus', () => ({}))
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

test('sections and moves', () => {
  const tasks = Object.entries(FILES).map(([file, text]) => parseTask(text, file))
  const sections = sectionsOf(tasks, '2026-10-07', { weeks: 1, startDay: 1 })
  expect(sections.map(section => [section.when, section.tasks.map(task => task.id)])).toEqual([
    ['now', []],
    ['this-sprint', ['T-001']],
    ['next-sprint', []],
    ['backlog', ['T-002']],
  ])
  expect(stepId(['a', 'b', 'c'], undefined, 1)).toBe('a')
  expect(stepId(['a', 'b', 'c'], undefined, -1)).toBe('c')
  expect(stepId(['a', 'b', 'c'], 'b', 1)).toBe('c')
  expect(stepId(['a', 'b', 'c'], 'c', 1)).toBe('c')
  expect(stepId(['a', 'b', 'c'], 'a', -1)).toBe('a')
  expect(stepId([], undefined, 1)).toBeUndefined()
})

// ---- The pane ----

test('a click opens the task menu under its row; its options act and close it', async ($, on) => {
  const { files, commands } = fakeProject(on)
  await $.command.run(tasksCommand())

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'supermanager', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: 'Sprint 41 · Oct 5–11' })).toBeDefined()
    expect(await ui.find({ key: 'task-T-003' })).toBeUndefined()
    expect(await ui.find({ key: 'menu-open' })).toBeUndefined()

    await ui.press({ key: 'task-T-002' })
    expect(await ui.find({ key: 'menu-open' })).toBeDefined()
    expect(await ui.find({ key: 'menu-backlog' })).toBeUndefined()
    await ui.press({ key: 'task-T-001' })
    expect(await ui.find({ key: 'menu-this-sprint' })).toBeUndefined()
    await ui.press({ key: 'task-T-001' })
    expect(await ui.find({ key: 'menu-open' })).toBeUndefined()

    await ui.press({ key: 'task-T-002' })
    await ui.press({ key: 'menu-next-sprint' })
    expect(files.get(`${DIR}/T-002-dark-mode.md`)).toContain('sprint: 2026-10-12')
    expect(await ui.find({ key: 'menu-open' })).toBeUndefined()

    commands.length = 0
    await ui.press({ key: 'task-T-002' })
    await ui.press({ key: 'menu-open' })
    expect(commands.at(-1)).toEqual(['open', `${DIR}/T-002-dark-mode.md`])
    await ui.press({ key: 'task-T-002' })
    await ui.press({ key: 'menu-backlog' })
    expect(files.get(`${DIR}/T-002-dark-mode.md`)).toContain('sprint: backlog')
    await ui.unmount()
  }

  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'terminal', ...PANE })
  await ui.press({ key: 'task-T-001' })
  await ui.press({ key: 'menu-done' })
  expect(files.get(`${DIR}/T-001-fix-login.md`)).toContain('status: done')
  expect(await ui.find({ type: 'Text', text: '2/2 done' })).toBeDefined()
  expect(files.get(`${ROOT}/docs/tasks.md`)).toContain('T-001 Fix login')
})

for (const surface of SURFACES) {
  test(`j/k select, the digits 1-4 move the selected task (${surface})`, async ($, on) => {
    const { files } = fakeProject(on)
    const file = () => files.get(`${DIR}/T-001-fix-login.md`)
    await $.command.run(tasksCommand())
    const ui = await $.ui.mount({ plugin: 'supermanager', surface, ...PANE })
    expect(await ui.find({ key: 'to-now' })).toBeUndefined()
    await ui.press({ key: 'next' })
    expect(await ui.find({ key: 'to-now' })).toBeDefined()
    expect((await ui.find({ key: 'start' }))).toBeDefined()
    await ui.press({ key: 'to-now' })
    expect(file()).toContain('urgent: true')
    await ui.press({ key: 'to-next-sprint' })
    expect(file()).toContain('sprint: 2026-10-12')
    await ui.press({ key: 'to-backlog' })
    expect(file()).toContain('sprint: backlog')
    await ui.press({ key: 'to-this-sprint' })
    expect(file()).toContain('sprint: 2026-10-05')
    await ui.press({ key: 'next' })
    await ui.press({ key: 'to-now' })
    expect(files.get(`${DIR}/T-002-dark-mode.md`)).toContain('urgent: true')
  })
}

test('inside IntelliJ, Open uses the running IDE', async ($, on) => {
  const { commands } = fakeProject(on, { __CFBundleIdentifier: 'com.jetbrains.intellij', TERMINAL_EMULATOR: 'JetBrains-JediTerm' })
  await $.command.run(tasksCommand())
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'desktop', ...PANE })
  await ui.press({ key: 'task-T-001' })
  await ui.press({ key: 'open' })
  expect(commands.at(-1)).toEqual(['open', '-b', 'com.jetbrains.intellij', `${DIR}/T-001-fix-login.md`])
})

test('/tasks config: toggles flip, the stepper steps, pickers pick, all written at once', async ($, on) => {
  const { settings } = fakeProject(on)
  await $.command.run(tasksCommand('config'))
  for (const surface of SURFACES) {
    settings.length = 0
    const ui = await $.ui.mount({ plugin: 'supermanager', surface, ...PANE })
    expect(await ui.find({ key: 'task-T-001' })).toBeUndefined()
    expect((await ui.find({ key: 'worktree' }))?.text).toBe('○ off')
    await ui.press({ key: 'worktree' })
    await ui.press({ key: 'keepAwake' })
    await ui.press({ key: 'contextLimit-up' })
    await ui.press({ key: 'contextLimit-down' })
    await ui.select({ key: 'editor', value: 'code' })
    expect(settings).toEqual([
      ['supermanager.worktree', true],
      ['supermanager.keepAwake', false],
      ['supermanager.contextLimit', 55],
      ['supermanager.contextLimit', 45],
      ['supermanager.editor', 'code'],
    ])
    await ui.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'terminal', ...PANE })
  await ui.press({ key: 'board' })
  expect(await ui.find({ key: 'task-T-001' })).toBeDefined()
})

test('only settings changed from the default are marked', { options: { worktree: true } }, async ($, on) => {
  fakeProject(on)
  await $.command.run(tasksCommand('config'))
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'desktop', ...PANE })
  expect(await ui.findAll({ type: 'Text', text: /^•$/ })).toHaveLength(1)
  expect((await ui.find({ key: 'worktree' }))?.text).toBe('● on')
})

test('the settings page hands off to /config, where our rows say whose they are', async ($, on) => {
  fakeProject(on)
  const ran: string[] = []
  on('command.run', { command: 'config' }, ($, e) => {
    ran.push(e.command)
    return { text: '' }
  })
  on('config.describe', ($, e) => ({ label: e.label, description: e.description, isHidden: e.isHidden }))
  await $.command.run(tasksCommand('config'))
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'terminal', ...PANE })
  await ui.press({ key: 'native' })
  expect(ran).toEqual(['config'])
  const row = { label: 'Editor', isHidden: false, provider: { plugin: 'supermanager', tier: 'user' as const } }
  expect((await $.config.describe({ key: 'supermanager.editor', ...row })).label).toBe('Supermanager: Editor')
  expect((await $.config.describe({ key: 'theme', ...row, label: 'Theme' })).label).toBe('Theme')
})

test('the phone draws the board and settings without pickers', async ($, on) => {
  fakeProject(on)
  await $.command.run(tasksCommand())
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'mobile', ...PANE })
  await ui.press({ key: 'task-T-001' })
  expect(await ui.find({ key: 'done' })).toBeDefined()
  await ui.press({ key: 'config' })
  expect(await ui.find({ type: 'Text', text: 'auto' })).toBeDefined()
})

test('the arrow keys select: the focus ring carries the selection', async ($, on) => {
  fakeProject(on)
  await $.command.run(tasksCommand())
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'terminal', ...PANE })
  const moved = await $.ui.focus({
    component: 'Pane',
    requestId: 'supermanager-tasks',
    plugin: 'supermanager',
    element: 'task-T-002',
    origin: { kind: 'person' },
  })
  expect(moved.deny).toBeUndefined()
  expect(await ui.find({ key: 'to-backlog' })).toBeDefined()
  expect(await ui.findAll({ type: 'Text', text: /^›$/ })).toHaveLength(1)
})
