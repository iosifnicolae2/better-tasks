import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { backlogToggle, filledCells, neighbour, sectionsOf, shifted, stepId } from '../hooks/board'
import { openCommand } from '../hooks/editor'
import { linesOf } from '../hooks/sessionview'
import type { HostApp } from '../hooks/editor'
import { parseTask } from '../hooks/tasks'

const ROOT = '/project'
const DIR = `${ROOT}/.claude/manager/tasks`
const WEDNESDAY = new Date(2026, 9, 7, 12).getTime()
const SURFACES = ['terminal', 'desktop'] as const

const PANE = {
  component: 'Pane',
  requestId: 'supermanager-sprint',
  props: {
    title: 'Sprint',
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
  [`${DIR}/T-004-rate-limit.md`]: taskFile('T-004', 'Rate limit', '2026-10-05', 'todo'),
  [`${DIR}/T-003-old-bug.md`]: taskFile('T-003', 'Old bug', '2026-10-05', 'done'),
}

/** A project of four tasks on disk (two this sprint, one in the backlog, one done), and a record of every command run and setting written. */
function fakeProject(on: On, env: Record<string, string> = {}, stored: Record<string, unknown> = {}) {
  const files = new Map(Object.entries(FILES))
  const commands: string[][] = []
  const settings: [string, unknown][] = []
  const clock = mock.clock(on, { now: WEDNESDAY })
  const opens: unknown[] = []
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
  on('ui.open', ($, e) => {
    opens.push(e)
    return { value: { isPlaced: true as const } }
  })
  on('ui.focus', () => ({}))
  return { files, commands, settings, opens, clock }
}

const sprintCommand = (args = '') => ({
  command: 'supermanager',
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
    ['this-sprint', ['T-001', 'T-004']],
    ['next-sprint', []],
    ['backlog', ['T-002']],
  ])
  expect(shifted(sections, 'T-004', -1)).toEqual({ when: 'this-sprint', ids: ['T-004', 'T-001'] })
  expect(shifted(sections, 'T-001', -1)).toEqual({ when: 'now', ids: ['T-001'] })
  expect(shifted(sections, 'T-004', 1)).toEqual({ when: 'next-sprint', ids: ['T-004'] })
  expect(shifted(sections, 'T-002', -1)).toEqual({ when: 'next-sprint', ids: ['T-002'] })
  expect(shifted(sections, 'T-002', 1)).toBeUndefined()
  expect(stepId(['a', 'b', 'c'], undefined, 1)).toBe('a')
  expect(stepId(['a', 'b', 'c'], undefined, -1)).toBe('c')
  expect(stepId(['a', 'b', 'c'], 'b', 1)).toBe('c')
  expect(stepId(['a', 'b', 'c'], 'c', 1)).toBe('c')
  expect(stepId(['a', 'b', 'c'], 'a', -1)).toBe('a')
  expect(stepId([], undefined, 1)).toBeUndefined()
})

test('moves: one section up or down, b in and out of the backlog, and the progress bar', () => {
  expect(neighbour('now', -1)).toBeUndefined()
  expect(neighbour('this-sprint', -1)).toBe('now')
  expect(neighbour('next-sprint', 1)).toBe('backlog')
  expect(neighbour('backlog', 1)).toBeUndefined()
  expect(backlogToggle('now')).toBe('backlog')
  expect(backlogToggle('backlog')).toBe('this-sprint')
  expect(filledCells(0, 0)).toBe(0)
  expect(filledCells(3, 5)).toBe(6)
  expect(filledCells(5, 5)).toBe(10)
})

/** The list's rows as drawn: every element before the detail area, by type and key only. */
async function listShape(ui: { drawn: () => Promise<unknown> }, depth = Infinity): Promise<string> {
  const shape = (node: unknown, level = 0): unknown => {
    if (typeof node !== 'object' || node === null) return typeof node
    const { type, props, children } = node as { type?: string; props?: { key?: string }; children?: unknown[] }
    return level >= depth ? [type] : [type, props?.key, (children ?? []).map(child => shape(child, level + 1))]
  }
  const text = JSON.stringify(shape(await ui.drawn()))
  return text.slice(0, text.indexOf('"open"'))
}

for (const surface of SURFACES) {
  test(`selecting, moving and acting never shift the rows (${surface})`, async ($, on) => {
    fakeProject(on)
    await $.command.run(sprintCommand())
    const ui = await $.ui.mount({ plugin: 'supermanager', surface, ...PANE })
    const before = await listShape(ui)
    expect(await ui.find({ key: 'open' })).toBeDefined()
    await ui.press({ key: 'task-T-004' })
    expect(await listShape(ui)).toBe(before)
    await ui.press({ key: 'next' })
    expect(await listShape(ui)).toBe(before)
    expect(await ui.findAll({ type: 'Text', text: /^▌$/ })).toHaveLength(1)
  })

  test(`⌥↑ ⌥↓ reorder within a section and cross at its edges; b toggles the backlog (${surface})`, async ($, on) => {
    const { files } = fakeProject(on)
    const head = (id: string) => files.get([...files.keys()].find(path => path.includes(id)) ?? '') ?? ''
    await $.command.run(sprintCommand())
    const ui = await $.ui.mount({ plugin: 'supermanager', surface, ...PANE })
    expect((await ui.find({ key: 'up' }))?.props).toMatchObject({ action: 'app:diffFileListUp' })
    expect((await ui.find({ key: 'toggle' }))?.props).toMatchObject({ hotkey: 'b' })

    await ui.press({ key: 'task-T-004' })
    await ui.press({ key: 'up' })
    expect(head('T-001')).toContain('order: 1')
    const rows = async () => (await ui.findAll({ type: 'Button' })).map(found => found.key).filter(key => key?.startsWith('task-'))
    expect((await rows()).slice(0, 2)).toEqual(['task-T-004', 'task-T-001'])

    await ui.press({ key: 'up' })
    expect(head('T-004')).toContain('urgent: true')
    await ui.press({ key: 'down' })
    expect(head('T-004')).toContain('urgent: false')
    expect((await rows()).slice(0, 2)).toEqual(['task-T-004', 'task-T-001'])

    await ui.press({ key: 'toggle' })
    expect(head('T-004')).toContain('sprint: backlog')
    expect((await ui.find({ key: 'toggle' }))?.text).toBe('This sprint')
    await ui.press({ key: 'toggle' })
    expect(head('T-004')).toContain('sprint: 2026-10-05')
  })

  test(`j/k walk the tasks; o opens the selected one (${surface})`, async ($, on) => {
    const { commands } = fakeProject(on)
    await $.command.run(sprintCommand())
    const ui = await $.ui.mount({ plugin: 'supermanager', surface, ...PANE })
    const title = async () => (await ui.find({ type: 'Text', text: /^T-00\d {2}/ }))?.text
    expect(await title()).toBe('T-001  Fix login')
    await ui.press({ key: 'next' })
    expect(await title()).toBe('T-004  Rate limit')
    await ui.press({ key: 'next' })
    await ui.press({ key: 'next' })
    expect(await title()).toBe('T-002  Dark mode')
    await ui.press({ key: 'previous' })
    expect(await title()).toBe('T-004  Rate limit')
    await ui.press({ key: 'open' })
    expect(commands.at(-1)).toEqual(['open', `${DIR}/T-004-rate-limit.md`])
    await ui.press({ key: 'task-T-001' })
    expect(await title()).toBe('T-001  Fix login')
  })

  test(`Enter or a click picks a task up, j/k carry it, Enter or a click drops it (${surface})`, async ($, on) => {
    const { files } = fakeProject(on)
    const head = (id: string) => files.get([...files.keys()].find(path => path.includes(id)) ?? '') ?? ''
    const rows = async () => (await ui.findAll({ type: 'Button' })).map(found => found.key).filter(key => key?.startsWith('task-'))
    await $.command.run(sprintCommand())
    const ui = await $.ui.mount({ plugin: 'supermanager', surface, ...PANE })
    const before = await listShape(ui, 3)

    await ui.press({ key: 'task-T-001' })
    expect(await ui.find({ type: 'Text', text: 'moving' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '↕ j/k move it · ⏎ or click: drop' })).toBeDefined()
    expect(await listShape(ui, 3)).toBe(before)

    await ui.press({ key: 'next' })
    expect(await rows()).toEqual(['task-T-004', 'task-T-001', 'task-T-002'])
    expect(head('T-001')).toContain('order: 1')
    await ui.press({ key: 'next' })
    expect(head('T-001')).toContain('sprint: 2026-10-12')
    await ui.press({ key: 'previous' })
    expect(head('T-001')).toContain('sprint: 2026-10-05')
    expect(await rows()).toEqual(['task-T-004', 'task-T-001', 'task-T-002'])

    await ui.press({ key: 'task-T-001' })
    expect(await ui.find({ type: 'Text', text: 'moving' })).toBeUndefined()
    await ui.press({ key: 'next' })
    expect(await rows()).toEqual(['task-T-004', 'task-T-001', 'task-T-002'])
    expect(await ui.find({ type: 'Text', text: /^T-002 {2}Dark mode$/ })).toBeDefined()
  })

  test(`any other action drops a picked-up task (${surface})`, async ($, on) => {
    fakeProject(on)
    await $.command.run(sprintCommand())
    const ui = await $.ui.mount({ plugin: 'supermanager', surface, ...PANE })
    await ui.press({ key: 'task-T-001' })
    await ui.press({ key: 'toggle' })
    expect(await ui.find({ type: 'Text', text: 'moving' })).toBeUndefined()
  })

  test(`the pane says how to give it the keys when it has none (${surface})`, async ($, on) => {
    fakeProject(on)
    await $.command.run(sprintCommand())
    const unfocused = await $.ui.mount({ plugin: 'supermanager', surface, ...PANE, props: { ...PANE.props, isFocused: false } })
    expect(await unfocused.find({ type: 'Text', text: 'ctrl+x tab to use the keys here' })).toBeDefined()
    await unfocused.unmount()
    const focused = await $.ui.mount({ plugin: 'supermanager', surface, ...PANE })
    expect(await focused.find({ type: 'Text', text: 'ctrl+x tab to use the keys here' })).toBeUndefined()
  })
}

test('/supermanager opens the pane asking for the keys, and asks again once the command is done', async ($, on) => {
  const { opens, clock } = fakeProject(on)
  await $.command.run(sprintCommand())
  expect(opens).toEqual([expect.objectContaining({ id: 'supermanager-sprint', focus: true })])
  await clock.advance(200)
  expect(opens).toHaveLength(2)
  expect(opens[1]).toEqual(expect.objectContaining({ focus: true }))
})

test('Mark as done logs the task and moves the selection to the next one', async ($, on) => {
  const { files } = fakeProject(on)
  await $.command.run(sprintCommand())
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'terminal', ...PANE })
  await ui.press({ key: 'done' })
  expect(files.get(`${DIR}/T-001-fix-login.md`)).toContain('status: done')
  expect(files.get(`${ROOT}/docs/tasks.md`)).toContain('T-001 Fix login')
  expect(await ui.find({ type: 'Text', text: 'T-004  Rate limit' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^2\/3$/ })).toBeDefined()
})

test('inside IntelliJ, Open uses the running IDE', async ($, on) => {
  const { commands } = fakeProject(on, { __CFBundleIdentifier: 'com.jetbrains.intellij', TERMINAL_EMULATOR: 'JetBrains-JediTerm' })
  await $.command.run(sprintCommand())
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'desktop', ...PANE })
  await ui.press({ key: 'task-T-001' })
  await ui.press({ key: 'open' })
  expect(commands.at(-1)).toEqual(['open', '-b', 'com.jetbrains.intellij', `${DIR}/T-001-fix-login.md`])
})

test('/supermanager config: toggles flip, the stepper steps, pickers pick, all written at once', async ($, on) => {
  const { settings } = fakeProject(on)
  await $.command.run(sprintCommand('config'))
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
  await $.command.run(sprintCommand('config'))
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
  await $.command.run(sprintCommand('config'))
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'terminal', ...PANE })
  await ui.press({ key: 'native' })
  expect(ran).toEqual(['config'])
  const row = { label: 'Editor', isHidden: false, provider: { plugin: 'supermanager', tier: 'user' as const } }
  expect((await $.config.describe({ key: 'supermanager.editor', ...row })).label).toBe('Supermanager: Editor')
  expect((await $.config.describe({ key: 'theme', ...row, label: 'Theme' })).label).toBe('Theme')
})

test('the phone draws the board and settings without pickers', async ($, on) => {
  fakeProject(on)
  await $.command.run(sprintCommand())
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'mobile', ...PANE })
  expect((await ui.find({ key: 'done' }))?.text).toBe('Mark as done')
  await ui.press({ key: 'config' })
  expect(await ui.find({ type: 'Text', text: 'auto' })).toBeDefined()
})

test('the arrow keys select: the focus ring carries the selection', async ($, on) => {
  fakeProject(on)
  await $.command.run(sprintCommand())
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'terminal', ...PANE })
  const moved = await $.ui.focus({
    component: 'Pane',
    requestId: 'supermanager-sprint',
    plugin: 'supermanager',
    element: 'task-T-002',
    origin: { kind: 'person' },
  })
  expect(moved.deny).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'T-002  Dark mode' })).toBeDefined()
  expect(await ui.findAll({ type: 'Text', text: /^▌$/ })).toHaveLength(1)
})

test('a task being worked on spins; the phone shows a still ✻', async ($, on) => {
  const { files } = fakeProject(on)
  files.set(`${DIR}/T-001-fix-login.md`, taskFile('T-001', 'Fix login', '2026-10-05', 'doing', 'auth'))
  await $.command.run(sprintCommand())
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'supermanager', surface, ...PANE })
    expect(await ui.find({ type: 'Client', key: 'spin-T-001' })).toBeDefined()
    expect(await ui.find({ type: 'Text', in: 'spin-T-001' })).toBeDefined()
    await ui.unmount()
  }
  const phone = await $.ui.mount({ plugin: 'supermanager', surface: 'mobile', ...PANE })
  expect(await phone.find({ type: 'Text', text: '✻' })).toBeDefined()
})

// ---- Teammates ----

const AUTH = { id: 'a1', name: 'auth', description: 'auth', type: 'teammate', status: 'running' }

/** The auth teammate running T-001, its context at 63 %, its session two messages long. */
async function withTeammate($: Engine, on: On) {
  const { files } = fakeProject(on)
  files.set(`${DIR}/T-001-fix-login.md`, taskFile('T-001', 'Fix login', '2026-10-05', 'doing', 'auth'))
  on('agent.list', () => ({ value: [AUTH] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000, percent: 10 }, rateLimits: [] } }))
  on('session.messages', () => ({
    value: [
      { role: 'user' as const, text: 'Fix the login redirect', toolUses: [] },
      { role: 'assistant' as const, text: 'Looking at the redirect.\nMore.', toolUses: [{ tool_use_id: 'u1', tool: 'Edit', input: { file_path: '/p/auth.ts' } }] },
    ],
  }))
  on('turn.step', async function* ($, e) {
    const usage = { input_tokens: 630, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage }
  })
  await $.command.run(sprintCommand())
  for await (const chunk of $.turn.step({ turnId: 't', index: 0, model: 'm', messageCount: 1, agentId: 'a1' })) void chunk
}

for (const surface of SURFACES) {
  test(`a task in progress shows its teammate; View session shows its transcript (${surface})`, async ($, on) => {
    await withTeammate($, on)
    const ui = await $.ui.mount({ plugin: 'supermanager', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /^⎿$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'idle' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /63%/ })).toBeDefined()
    expect((await ui.find({ key: 'view' }))?.props).toMatchObject({ hotkey: 'v' })
    await ui.press({ key: 'view' })
    expect(await ui.find({ key: 'task-T-001' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'Looking at the redirect.' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /⎿ editing auth\.ts/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /↓ to auth in the agent list, Enter/ })).toBeDefined()
    await ui.press({ key: 'back' })
    expect(await ui.find({ key: 'task-T-001' })).toBeDefined()
  })
}

test('a session reads as transcript lines: what it was told, what it says, what it does', () => {
  const lines = linesOf([
    { role: 'user', text: 'Go', toolUses: [] },
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'u', tool: 'Bash', input: { command: 'npm test' } }] },
    { role: 'assistant', text: 'All green.', toolUses: [] },
  ])
  expect(lines).toEqual([
    { kind: 'you', text: 'Go' },
    { kind: 'does', text: 'running npm test' },
    { kind: 'says', text: 'All green.' },
  ])
  expect(linesOf([{ role: 'assistant', text: 'a', toolUses: [] }, { role: 'assistant', text: 'b', toolUses: [] }], 1)).toEqual([
    { kind: 'says', text: 'b' },
  ])
})

test("the pane follows the project's config.json, and its settings page says which values come from it", async ($, on) => {
  const { files, commands } = fakeProject(on)
  files.set(`${ROOT}/.claude/manager/config.json`, JSON.stringify({ sprintWeeks: '2', editor: 'code', sprintsFile: 'docs/sprints.md' }))
  await $.command.run(sprintCommand())
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: 'Sprint 40 · Sep 28–Oct 11' })).toBeDefined()
  await ui.press({ key: 'open' })
  expect(commands.at(-1)).toEqual(['code', `${DIR}/T-001-fix-login.md`])

  await ui.press({ key: 'config' })
  expect(await ui.findAll({ type: 'Text', text: '◆ from project' })).toHaveLength(2)
  await ui.press({ key: 'sprints' })
  expect(commands.at(-1)).toEqual(['code', `${ROOT}/docs/sprints.md`])
})

for (const surface of SURFACES) {
  test(`"This project" shows config.json's problems, creates the starter files and opens them (${surface})`, async ($, on) => {
    const { files, commands } = fakeProject(on)
    files.set(`${ROOT}/.claude/manager/config.json`, JSON.stringify({ contextLimit: 40, colour: 'blue' }))
    await $.command.run(sprintCommand('config'))
    const ui = await $.ui.mount({ plugin: 'supermanager', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /◆ 1 from config\.json; \/config does not override them/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /⚠ .*colour/ })).toBeDefined()
    expect((await ui.find({ key: 'init' }))?.text).toMatch(/^Create \d starter files$/)
    expect((await ui.find({ key: 'file-config.json' }))?.text).toBe('↗ config.json')
    expect((await ui.find({ key: 'file-teammate.md' }))?.text).toBe('+ teammate.md')
    await ui.press({ key: 'file-teammate.md' })
    expect(files.has(`${ROOT}/.claude/manager/teammate.md`)).toBe(true)
    expect(files.has(`${ROOT}/.claude/manager/coordinator.md`)).toBe(false)
    expect(commands.at(-1)).toEqual(['open', `${ROOT}/.claude/manager/teammate.md`])
    expect((await ui.find({ key: 'file-teammate.md' }))?.text).toBe('↗ teammate.md')

    await ui.press({ key: 'init' })
    expect(files.has(`${ROOT}/.claude/manager/coordinator.md`)).toBe(true)
    expect(JSON.parse(files.get(`${ROOT}/.claude/manager/config.json`) ?? '{}')).toMatchObject({ contextLimit: 40 })
    expect(await ui.find({ key: 'init' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '✓ All starter files are in place' })).toBeDefined()
  })
}
