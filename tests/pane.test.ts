import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { backlogToggle, filledCells, neighbour, rowRoles, sectionsOf, shifted, shortDates, windowOf } from '../hooks/board'
import { openCommand } from '../hooks/editor'
import type { HostApp } from '../hooks/editor'
import { parseTask } from '../hooks/tasks'

const ROOT = '/project'
const DIR = `${ROOT}/.claude/tasks`
const WEDNESDAY = new Date(2026, 9, 7, 12).getTime()
const SURFACES = ['terminal', 'desktop'] as const

const PANE = {
  component: 'Pane',
  requestId: 'better-tasks-sprint',
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
  command: 'better-tasks',
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
  expect(rowRoles(['a', 'b', 'c', 'd'], 'b')).toEqual({ a: 'slot-up', b: 'moving', c: 'slot-down', d: 'still' })
  expect(shortDates('2026-09-28', '2026-10-04')).toBe('Sep 28–Oct 4')
  expect(shortDates('2026-10-05', '2026-10-11')).toBe('Oct 5–11')
  expect(windowOf(5, 10, 3)).toEqual({ start: 0, end: 5 })
  expect(windowOf(30, 10, 0)).toEqual({ start: 0, end: 10 })
  expect(windowOf(30, 10, 15)).toEqual({ start: 10, end: 20 })
  expect(windowOf(30, 10, 29)).toEqual({ start: 20, end: 30 })
})

test('moves: one section up or down, b in and out of the backlog, and the progress bar', () => {
  expect(neighbour('now', -1)).toBeUndefined()
  expect(neighbour('this-sprint', -1)).toBe('now')
  expect(neighbour('next-sprint', 1)).toBe('backlog')
  expect(neighbour('backlog', 1)).toBeUndefined()
  expect(backlogToggle('now')).toBe('backlog')
  expect(backlogToggle('backlog')).toBe('this-sprint')
  expect(filledCells(0, 0)).toBe(0)
  expect(filledCells(3, 5)).toBe(3)
  expect(filledCells(5, 5)).toBe(5)
})

type Node = { type?: string; props?: { key?: string }; children?: unknown[] }

/** The list window's lines as drawn (not the box or key line under it), by type and key. */
async function listShape(ui: { drawn: () => Promise<unknown> }, depth = Infinity): Promise<string> {
  const shape = (node: unknown, level = 0): unknown => {
    if (typeof node !== 'object' || node === null) return typeof node
    const { type, props, children } = node as Node
    return level >= depth ? [type] : [type, props?.key, (children ?? []).map(child => shape(child, level + 1))]
  }
  return JSON.stringify((await listLines(ui)).map(line => shape(line, 1)))
}

async function listLines(ui: { drawn: () => Promise<unknown> }): Promise<unknown[]> {
  const board = ((await ui.drawn()) as Node).children?.[0] as Node
  return ((board.children?.[0] as Node).children ?? [])
}

/** ↑ or ↓ as the engine raises them: the person moving the ring to the next element that takes it. */
const arrowTo = ($: Engine, element: string) =>
  $.ui.focus({ component: 'Pane', requestId: 'better-tasks-sprint', plugin: 'better-tasks', element, origin: { kind: 'person' } })

const HEADINGS = /^(Currently working on|This sprint|Next sprint|Backlog)$/

for (const surface of SURFACES) {
  test(`selecting, moving and acting never shift the rows (${surface})`, async ($, on) => {
    fakeProject(on)
    await $.command.run(sprintCommand())
    const ui = await $.ui.mount({ plugin: 'better-tasks', surface, ...PANE })
    const before = await listShape(ui, 2)
    expect(await ui.find({ key: 'open' })).toBeDefined()
    await ui.press({ key: 'task-T-004' })
    expect(await listShape(ui, 2)).toBe(before)
    await arrowTo($, 'task-T-002')
    expect(await listShape(ui, 2)).toBe(before)
    expect(await ui.findAll({ type: 'Text', text: /^▌$/ })).toHaveLength(1)
  })

  test(`every section stays drawn when its last task leaves, so nothing above moves (${surface})`, async ($, on) => {
    const { files } = fakeProject(on)
    await $.command.run(sprintCommand())
    const ui = await $.ui.mount({ plugin: 'better-tasks', surface, ...PANE })
    const headings = async () => (await ui.findAll({ type: 'Text', text: HEADINGS })).map(found => found.text)
    expect(await headings()).toEqual(['Currently working on', 'This sprint', 'Next sprint', 'Backlog'])
    expect(await ui.findAll({ type: 'Text', text: '  —  empty' })).toHaveLength(2)
    const before = (await listLines(ui)).length

    await ui.press({ key: 'task-T-002' })
    await ui.press({ key: 'up' })
    expect(files.get(`${DIR}/T-002-dark-mode.md`)).toContain('sprint: 2026-10-12')
    expect(await headings()).toEqual(['Currently working on', 'This sprint', 'Next sprint', 'Backlog'])
    expect((await listLines(ui)).length).toBe(before)
  })

  test(`⌥↑ ⌥↓ reorder within a section and cross at its edges; b toggles the backlog (${surface})`, async ($, on) => {
    const { files } = fakeProject(on)
    const head = (id: string) => files.get([...files.keys()].find(path => path.includes(id)) ?? '') ?? ''
    await $.command.run(sprintCommand())
    const ui = await $.ui.mount({ plugin: 'better-tasks', surface, ...PANE })
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

  test(`↑↓ select; o opens the selected one; no j/k anywhere (${surface})`, async ($, on) => {
    const { commands } = fakeProject(on)
    await $.command.run(sprintCommand())
    const ui = await $.ui.mount({ plugin: 'better-tasks', surface, ...PANE })
    const title = async () => (await ui.find({ type: 'Text', text: /^T-00\d {2}/ }))?.text
    expect(await title()).toBe('T-001  Fix login')
    await arrowTo($, 'task-T-004')
    expect(await title()).toBe('T-004  Rate limit')
    await ui.press({ key: 'open' })
    expect(commands.at(-1)).toEqual(['open', `${DIR}/T-004-rate-limit.md`])
    const hotkeys = (await ui.findAll({ type: 'Button' })).map(found => found.props.hotkey)
    expect(hotkeys).not.toContain('j')
    expect(hotkeys).not.toContain('k')
    expect(await ui.find({ type: 'Text', text: /j\/k|j: |k: / })).toBeUndefined()
  })

  test(`Enter hands the keys to the actions: only the row and the actions take the ring, ↑ comes back (${surface})`, async ($, on) => {
    fakeProject(on)
    await $.command.run(sprintCommand())
    const ui = await $.ui.mount({ plugin: 'better-tasks', surface, ...PANE })
    const buttons = async () => (await ui.findAll({ type: 'Button' })).map(found => found.key)
    await ui.press({ key: 'task-T-001' })
    expect(await buttons()).toEqual(['task-T-001', 'open', 'start', 'done', 'move', 'up', 'down', 'toggle'])
    expect(await ui.find({ type: 'Text', text: '←→ choose · ⏎ run · ↑ back to the list' })).toBeDefined()
    await arrowTo($, 'start')
    expect(await buttons()).toContain('open')
    await arrowTo($, 'task-T-001')
    expect(await buttons()).toContain('task-T-004')
    expect(await ui.find({ type: 'Text', text: '↑↓ select · ⏎ actions' })).toBeDefined()
  })

  test(`Enter → actions → Move: then ↑↓ carry the task and Enter stops (${surface})`, async ($, on) => {
    const { files } = fakeProject(on)
    const head = (id: string) => files.get([...files.keys()].find(path => path.includes(id)) ?? '') ?? ''
    const buttons = async () => (await ui.findAll({ type: 'Button' })).map(found => found.key)
    await $.command.run(sprintCommand())
    const ui = await $.ui.mount({ plugin: 'better-tasks', surface, ...PANE })
    const before = await listShape(ui, 1)

    await ui.press({ key: 'task-T-001' })
    expect(await ui.find({ type: 'Text', text: 'moving' })).toBeUndefined()
    await ui.press({ key: 'move' })
    expect(await ui.find({ type: 'Text', text: 'moving' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '↕ ↑↓ move it · ⏎ stop' })).toBeDefined()
    expect(await listShape(ui, 1)).toBe(before)
    // Only the moving task and the two slots ↑ and ↓ can land on take the ring.
    expect(await buttons()).toEqual(['slot-up', 'task-T-001', 'slot-down'])

    expect((await arrowTo($, 'slot-down')).deny).toBeDefined()
    expect(head('T-001')).toContain('order: 1')
    expect(await buttons()).toEqual(['slot-up', 'task-T-001', 'slot-down'])
    await arrowTo($, 'slot-down')
    expect(head('T-001')).toContain('sprint: 2026-10-12')
    await arrowTo($, 'slot-up')
    expect(head('T-001')).toContain('sprint: 2026-10-05')
    await arrowTo($, 'slot-up')
    await arrowTo($, 'slot-up')
    expect(head('T-001')).toContain('urgent: true')
    await arrowTo($, 'slot-up')
    expect(head('T-001')).toContain('urgent: true')
    await arrowTo($, 'slot-down')
    expect(head('T-001')).toContain('urgent: false')

    await ui.press({ key: 'task-T-001' })
    expect(await ui.find({ type: 'Text', text: 'moving' })).toBeUndefined()
    expect(await buttons()).toContain('open')
    expect((await arrowTo($, 'task-T-002')).deny).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^T-002 {2}Dark mode$/ })).toBeDefined()
  })

  test(`a board without the keys looks it and cannot act on a chord from the prompt (${surface})`, async ($, on) => {
    fakeProject(on)
    await $.command.run(sprintCommand())
    const ui = await $.ui.mount({ plugin: 'better-tasks', surface, ...PANE, props: { ...PANE.props, isFocused: false } })
    expect(await ui.find({ type: 'Text', text: 'The keys are with the prompt · click or ctrl+x tab to use the board' })).toBeDefined()
    expect(await ui.find({ key: 'up' })).toBeUndefined()
    expect(await ui.find({ key: 'down' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '⌥↑' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /↑↓ select/ })).toBeUndefined()
  })

  test(`an arrow past the board's ends never takes the ring off the board (${surface})`, async ($, on) => {
    fakeProject(on)
    await $.command.run(sprintCommand())
    await $.ui.mount({ plugin: 'better-tasks', surface, ...PANE })
    const offTheBoard = await $.ui.focus({ component: 'Pane', requestId: 'better-tasks-sprint', origin: { kind: 'person' } })
    expect(offTheBoard.deny).toBeDefined()
    expect((await arrowTo($, 'task-T-004')).deny).toBeUndefined()
  })

  test(`closed tasks sit collapsed in their own section; opened, one can be reopened (${surface})`, async ($, on) => {
    const { files } = fakeProject(on)
    await $.command.run(sprintCommand())
    const ui = await $.ui.mount({ plugin: 'better-tasks', surface, ...PANE })
    expect((await ui.find({ key: 'closed' }))?.text).toBe('Closed · 1 ▸')
    expect(await ui.find({ key: 'task-T-003' })).toBeUndefined()
    await ui.press({ key: 'closed' })
    expect((await ui.find({ key: 'closed' }))?.text).toBe('Closed · 1 ▾')
    await ui.press({ key: 'task-T-003' })
    expect(await ui.find({ key: 'reopen' })).toBeDefined()
    await ui.press({ key: 'reopen' })
    expect(files.get(`${DIR}/T-003-old-bug.md`)).toContain('status: todo')
    expect((await ui.find({ key: 'closed' }))?.text).toBe('Closed · 0 ▾')
    await ui.press({ key: 'closed' })
    expect((await ui.find({ key: 'closed' }))?.text).toBe('Closed · 0 ▸')
  })

  test(`the box and key line stay pinned under a list window of fixed height (${surface})`, async ($, on) => {
    const { files } = fakeProject(on)
    for (let n = 10; n < 40; n += 1) files.set(`${DIR}/T-0${n}-x.md`, taskFile(`T-0${n}`, `Task ${n}`, 'backlog', 'todo'))
    await $.command.run(sprintCommand())
    const ui = await $.ui.mount({ plugin: 'better-tasks', surface, ...PANE, props: { ...PANE.props, scroll: { offset: 0, bodyRows: 24 } } })
    expect(await listLines(ui)).toHaveLength(16)
    expect(await ui.find({ type: 'Text', text: /more below$/ })).toBeDefined()
    await arrowTo($, 'task-T-039')
    expect(await listLines(ui)).toHaveLength(16)
    expect(await ui.find({ key: 'task-T-039' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /more above$/ })).toBeDefined()
  })

  test(`even a very short pane keeps the box at the bottom and the selection in the list (${surface})`, async ($, on) => {
    fakeProject(on)
    await $.command.run(sprintCommand())
    const ui = await $.ui.mount({ plugin: 'better-tasks', surface, ...PANE, props: { ...PANE.props, scroll: { offset: 0, bodyRows: 10 } } })
    expect(await listLines(ui)).toHaveLength(2)
    expect(await ui.find({ key: 'task-T-001' })).toBeDefined()
    expect(await ui.find({ key: 'open' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /done this sprint/ })).toBeUndefined()
  })

  test(`the pane says how to give it the keys when it has none (${surface})`, async ($, on) => {
    fakeProject(on)
    await $.command.run(sprintCommand())
    const unfocused = await $.ui.mount({ plugin: 'better-tasks', surface, ...PANE, props: { ...PANE.props, isFocused: false } })
    expect(await unfocused.find({ type: 'Text', text: 'The keys are with the prompt · click or ctrl+x tab to use the board' })).toBeDefined()
    await unfocused.unmount()
    const focused = await $.ui.mount({ plugin: 'better-tasks', surface, ...PANE })
    expect(await focused.find({ type: 'Text', text: 'The keys are with the prompt · click or ctrl+x tab to use the board' })).toBeUndefined()
  })
}

test('/better-tasks opens the pane asking for the keys, and asks again once the command is done', async ($, on) => {
  const { opens, clock } = fakeProject(on)
  await $.command.run(sprintCommand())
  expect(opens).toEqual([expect.objectContaining({ id: 'better-tasks-sprint', focus: true })])
  await clock.advance(200)
  expect(opens).toHaveLength(2)
  expect(opens[1]).toEqual(expect.objectContaining({ focus: true }))
})

test('Mark as done logs the task and moves the selection to the next one', async ($, on) => {
  const { files } = fakeProject(on)
  await $.command.run(sprintCommand())
  const ui = await $.ui.mount({ plugin: 'better-tasks', surface: 'terminal', ...PANE })
  await ui.press({ key: 'done' })
  expect(files.get(`${DIR}/T-001-fix-login.md`)).toContain('status: done')
  expect(files.get(`${ROOT}/docs/tasks.md`)).toContain('T-001 Fix login')
  expect(await ui.find({ type: 'Text', text: 'T-004  Rate limit' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^2\/3$/ })).toBeDefined()
})

test('inside IntelliJ, Open uses the running IDE', async ($, on) => {
  const { commands } = fakeProject(on, { __CFBundleIdentifier: 'com.jetbrains.intellij', TERMINAL_EMULATOR: 'JetBrains-JediTerm' })
  await $.command.run(sprintCommand())
  const ui = await $.ui.mount({ plugin: 'better-tasks', surface: 'desktop', ...PANE })
  await ui.press({ key: 'task-T-001' })
  await ui.press({ key: 'open' })
  expect(commands.at(-1)).toEqual(['open', '-b', 'com.jetbrains.intellij', `${DIR}/T-001-fix-login.md`])
})

for (const surface of SURFACES) {
  test(`settings are rows like /config: Enter changes a value in place, nothing expands (${surface})`, async ($, on) => {
    const { settings } = fakeProject(on)
    await $.command.run(sprintCommand('config'))
    const ui = await $.ui.mount({ plugin: 'better-tasks', surface, ...PANE })
    const shape = async () => JSON.stringify(await ui.drawn(), (key, value) => (key === 'children' || key === 'type' ? value : typeof value === 'string' ? '' : value))
    expect(await ui.find({ key: 'task-T-001' })).toBeUndefined()
    expect(await ui.findAll({ type: 'Select' })).toHaveLength(0)
    const before = await shape()
    for (const key of ['cfg-editor', 'cfg-worktree', 'cfg-contextLimit', 'cfg-keepAwake', 'cfg-sprintWeeks', 'cfg-sprintStart']) {
      await ui.press({ key })
    }
    expect(settings).toEqual([
      ['better-tasks.editor', 'default'],
      ['better-tasks.worktree', true],
      ['better-tasks.contextLimit', 60],
      ['better-tasks.keepAwake', false],
      ['better-tasks.sprintWeeks', '2'],
      ['better-tasks.sprintStart', 'tuesday'],
    ])
    expect(await shape()).toBe(before)
    settings.length = 0
    await ui.unmount()
  })

  test(`the line at the bottom describes the focused row (${surface})`, async ($, on) => {
    fakeProject(on)
    await $.command.run(sprintCommand('config'))
    const ui = await $.ui.mount({ plugin: 'better-tasks', surface, ...PANE })
    await arrowTo($, 'cfg-contextLimit')
    expect(await ui.find({ type: 'Text', text: /^Context limit: No new work goes to a teammate/ })).toBeDefined()
    await arrowTo($, 'file-teammate.md')
    expect(await ui.find({ type: 'Text', text: /^teammate\.md: .*creates it/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '↑↓ choose · ⏎ change' })).toBeDefined()
    await ui.press({ key: 'board' })
    expect(await ui.find({ key: 'task-T-001' })).toBeDefined()
  })
}

test('only settings changed from the default are marked', { options: { worktree: true } }, async ($, on) => {
  fakeProject(on)
  await $.command.run(sprintCommand('config'))
  const ui = await $.ui.mount({ plugin: 'better-tasks', surface: 'desktop', ...PANE })
  expect(await ui.findAll({ type: 'Text', text: /^•$/ })).toHaveLength(1)
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
  const ui = await $.ui.mount({ plugin: 'better-tasks', surface: 'terminal', ...PANE })
  await ui.press({ key: 'cfg-native' })
  expect(ran).toEqual(['config'])
  const row = { label: 'Editor', isHidden: false, provider: { plugin: 'better-tasks', tier: 'user' as const } }
  expect((await $.config.describe({ key: 'better-tasks.editor', ...row })).label).toBe('Better Tasks: Editor')
  expect((await $.config.describe({ key: 'theme', ...row, label: 'Theme' })).label).toBe('Theme')
})

test('the phone draws the board and settings without pickers', async ($, on) => {
  fakeProject(on)
  await $.command.run(sprintCommand())
  const ui = await $.ui.mount({ plugin: 'better-tasks', surface: 'mobile', ...PANE })
  expect((await ui.find({ key: 'done' }))?.text).toBe('Mark as done')
  await ui.press({ key: 'config' })
  expect(await ui.find({ type: 'Text', text: 'auto' })).toBeDefined()
})

test('the arrow keys select: the focus ring carries the selection', async ($, on) => {
  fakeProject(on)
  await $.command.run(sprintCommand())
  const ui = await $.ui.mount({ plugin: 'better-tasks', surface: 'terminal', ...PANE })
  const moved = await $.ui.focus({
    component: 'Pane',
    requestId: 'better-tasks-sprint',
    plugin: 'better-tasks',
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
    const ui = await $.ui.mount({ plugin: 'better-tasks', surface, ...PANE })
    expect(await ui.find({ type: 'Client', key: 'spin-T-001' })).toBeDefined()
    expect(await ui.find({ type: 'Text', in: 'spin-T-001' })).toBeDefined()
    await ui.unmount()
  }
  const phone = await $.ui.mount({ plugin: 'better-tasks', surface: 'mobile', ...PANE })
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
  on('turn.step', async function* ($, e) {
    const usage = { input_tokens: 630, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage }
  })
  await $.command.run(sprintCommand())
  for await (const chunk of $.turn.step({ turnId: 't', index: 0, model: 'm', messageCount: 1, agentId: 'a1' })) void chunk
}

for (const surface of SURFACES) {
  test(`a task in progress shows its teammate's state, activity and context (${surface})`, async ($, on) => {
    await withTeammate($, on)
    const ui = await $.ui.mount({ plugin: 'better-tasks', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /^⎿$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'idle' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /63%/ })).toBeDefined()
    expect(await ui.find({ key: 'view' })).toBeUndefined()
  })
}

test("the pane follows the project's config.json, and its settings page says which values come from it", async ($, on) => {
  const { files, commands } = fakeProject(on)
  files.set(`${ROOT}/.claude/tasks/config.json`, JSON.stringify({ sprintWeeks: '2', editor: 'code', sprintsFile: 'docs/sprints.md' }))
  await $.command.run(sprintCommand())
  const ui = await $.ui.mount({ plugin: 'better-tasks', surface: 'terminal', ...PANE })
  expect((await ui.find({ type: 'Text', text: /^◆ This sprint/ }))?.text).toMatch(/· Weeks 40–41 · Sep 28–Oct 11 · 5 days left$/)
  expect((await ui.find({ type: 'Text', text: /^◇ Next sprint/ }))?.text).toBe('◇ Next sprint 2 · Weeks 42–43 · Oct 12–25')
  await ui.press({ key: 'open' })
  expect(commands.at(-1)).toEqual(['code', `${DIR}/T-001-fix-login.md`])

  await ui.press({ key: 'config' })
  expect(await ui.findAll({ type: 'Text', text: /^◆$/ })).toHaveLength(2)
  await ui.press({ key: 'cfg-sprints' })
  expect(commands.at(-1)).toEqual(['code', `${ROOT}/docs/sprints.md`])
})

for (const surface of SURFACES) {
  test(`"This project" rows open or create the project's files and show config.json's problems (${surface})`, async ($, on) => {
    const { files, commands } = fakeProject(on)
    files.set(`${ROOT}/.claude/tasks/config.json`, JSON.stringify({ contextLimit: 40, colour: 'blue' }))
    await $.command.run(sprintCommand('config'))
    const ui = await $.ui.mount({ plugin: 'better-tasks', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: '1 value · open' })).toBeDefined()
    expect(await ui.findAll({ type: 'Text', text: 'default · create' })).toHaveLength(3)
    expect(await ui.find({ type: 'Text', text: /⚠ .*colour/ })).toBeDefined()

    await ui.press({ key: 'file-teammate.md' })
    expect(files.has(`${ROOT}/.claude/tasks/teammate.md`)).toBe(true)
    expect(files.has(`${ROOT}/.claude/tasks/coordinator.md`)).toBe(false)
    expect(commands.at(-1)).toEqual(['open', `${ROOT}/.claude/tasks/teammate.md`])
    expect(await ui.findAll({ type: 'Text', text: 'default · create' })).toHaveLength(2)
    expect(await ui.find({ type: 'Text', text: 'custom · open' })).toBeDefined()
  })
}

for (const surface of SURFACES) {
  test(`each sprint's heading carries its week, dates and days left; the goal sits under This sprint (${surface})`, async ($, on) => {
    const { files } = fakeProject(on)
    await $.command.run(sprintCommand())
    const ui = await $.ui.mount({ plugin: 'better-tasks', surface, ...PANE })
    expect((await ui.find({ type: 'Text', text: /^◆ This sprint/ }))?.text).toBe('◆ This sprint 2 · Week 41 · Oct 5–11 · 5 days left')
    expect((await ui.find({ type: 'Text', text: /^◇ Next sprint/ }))?.text).toBe('◇ Next sprint · Week 42 · Oct 12–18')
    expect(await ui.find({ type: 'Text', text: /^⚡ Currently working on$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Sprint \d/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /◎/ })).toBeUndefined()
    const lines = (await listLines(ui)).length

    files.set(`${ROOT}/.claude/tasks/sprints.md`, '# Sprints\n\n## 2026-10-05 · Sprint 41\nGoal: Ship the login flow\n')
    await ui.press({ key: 'task-T-004' })
    expect((await ui.find({ type: 'Text', text: /◎/ }))?.text).toBe('  ◎ Ship the login flow')
    expect((await listLines(ui)).length).toBe(lines)

    await ui.press({ key: 'config' })
    expect(await ui.find({ type: 'Text', text: 'Sprint' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Sprint 41 · Week 41 · Mon Oct 5 – Sun Oct 11' })).toBeDefined()
  })
}

test('a 4-week sprint shows its weeks in the settings preview', { options: { sprintWeeks: '4' } }, async ($, on) => {
  fakeProject(on)
  await $.command.run(sprintCommand('config'))
  const ui = await $.ui.mount({ plugin: 'better-tasks', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /^Sprint \d+ · Weeks \d+–\d+ · / })).toBeDefined()
})
