import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const ROOT = '/project'
const SESSION = { cwd: ROOT, surface: 'terminal', isInteractive: true } as const
const PANE_ID = 'supermanager-sprint'
const PANE = {
  component: 'Pane',
  requestId: PANE_ID,
  props: { title: 'Sprint', isFocused: false, bodyColumns: 76, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

/** Just enough engine for a session to start, and a record of every pane it was asked to open. */
function fakeEngine(on: On, stored: Record<string, unknown>, env: Record<string, string> = {}, openPanes: string[] = [], seed: Record<string, string> = {}) {
  const opens: { id: string; focus?: true }[] = []
  const logs: string[] = []
  const files = new Map<string, string>(Object.entries(seed))
  mock.clock(on, { now: new Date(2026, 9, 7, 12).getTime() })
  mock.store(on, stored)
  mock.env(on, { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1', ...env })
  on('settings.read', () => ({ value: { env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' } } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: ROOT }))
  on('session.id', () => ({ value: 's1' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000, percent: 1 }, rateLimits: [] } }))
  on('agent.list', () => ({ value: [] }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__supermanager__${e.name}` } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('fs.read', ($, e) => (files.has(e.path) ? { value: files.get(e.path) ?? '' } : { deny: `ENOENT ${e.path}` }))
  on('fs.write', ($, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.list', ($, e) => ({
    value: [...files.keys()]
      .filter(path => path.startsWith(`${e.path}/`))
      .map(path => ({ name: path.slice(e.path.length + 1), kind: 'file' as const, size: 0, mtimeMs: 0, isLink: false })),
  }))
  on('process.spawn', async function* () {
    return { value: { code: 0, signal: null } }
  })
  on('ui.panes', () => ({ value: openPanes.map(id => ({ id, title: 'Sprint', isShown: true, isFocused: false, isPlaced: true })) }))
  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: { answers: { When: 'This sprint' } } }))
  on('ui.open', ($, e) => {
    opens.push(e)
    return { value: { isPlaced: true as const } }
  })
  return { opens, logs }
}

test('a board left open comes back at the next start, without taking the keys', async ($, on) => {
  const { opens } = fakeEngine(on, { 'pane.open': { [ROOT]: true } })
  await $.session.start(SESSION)
  expect(opens).toEqual([expect.objectContaining({ id: PANE_ID })])
  expect(opens[0]?.focus).toBeUndefined()
})

test('a board closed by hand, or open in another project, stays closed', async ($, on) => {
  const { opens } = fakeEngine(on, { 'pane.open': { [ROOT]: false, '/other': true } })
  await $.session.start(SESSION)
  expect(opens).toEqual([])
})

test('opening the board remembers it for this project', async ($, on) => {
  const { opens } = fakeEngine(on, {})
  const run = { command: 'supermanager', args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 160 } }
  await $.command.run(run)
  expect(opens).toHaveLength(1)
  await $.session.start(SESSION)
  expect(opens).toHaveLength(2)
  expect(opens[1]?.focus).toBeUndefined()
})

test('/supermanager on a board that reopened on its own asks for the keys, without a second pane', async ($, on) => {
  const { opens } = fakeEngine(on, { 'pane.open': { [ROOT]: true } })
  await $.session.start(SESSION)
  expect(opens[0]?.focus).toBeUndefined()
  const run = { command: 'supermanager', args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 160 } }
  await $.command.run(run)
  expect(opens.slice(1)).toEqual([expect.objectContaining({ id: PANE_ID, focus: true })])
  expect(new Set(opens.map(open => open.id))).toEqual(new Set([PANE_ID]))
})

test('on the main screen (or in tmux) it does not reopen; one line says how to open it, and the flag stays', async ($, on) => {
  const { opens, logs } = fakeEngine(on, { 'pane.open': { [ROOT]: true } }, { CLAUDE_CODE_NO_FLICKER: '0' })
  await $.session.start(SESSION)
  expect(opens).toEqual([])
  expect(logs).toContain('supermanager: the board was open last time: type /supermanager')
  logs.length = 0
  await $.session.start(SESSION)
  expect(logs).toContain('supermanager: the board was open last time: type /supermanager')
})

test('inside tmux it does not reopen either', async ($, on) => {
  const { opens, logs } = fakeEngine(on, { 'pane.open': { [ROOT]: true } }, { TMUX: '/tmp/tmux-501/default,1,0' })
  await $.session.start(SESSION)
  expect(opens).toEqual([])
  expect(logs).toContain('supermanager: the board was open last time: type /supermanager')
})

const CREATE = { tool: 'mcp__supermanager__task_create', tool_use_id: 'c1', title: 'Fix the login redirect', goal: 'No loop', when: 'this-sprint' } as const

async function createTask($: Engine) {
  await $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'q1', questions: [] } as never)
  return $.tool.call(CREATE)
}

test('a created task opens the board on it, without taking the keys (fullscreen)', async ($, on) => {
  const { opens } = fakeEngine(on, {})
  await $.session.start(SESSION)
  const made = await createTask($)
  expect(String(made.result)).toMatch(/^Created T-001/)
  expect(opens).toEqual([expect.objectContaining({ id: PANE_ID })])
  expect(opens[0]?.focus).toBeUndefined()
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /^T-001 {2}Fix the login redirect$/ })).toBeDefined()
})

test('with the board already open, a created task only becomes the selection', async ($, on) => {
  const older = '---\nid: T-001\ntitle: Older task\nsprint: 2026-10-05\nurgent: false\nstatus: todo\nowner: \nrolled: 0\norder: 0\ncreated: 2026-10-01\n---\n'
  const { opens } = fakeEngine(on, {}, {}, [PANE_ID], { [`${ROOT}/.claude/manager/tasks/T-001-older-task.md`]: older })
  await $.session.start(SESSION)
  await createTask($)
  expect(opens).toEqual([])
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /^T-002 {2}Fix the login redirect$/ })).toBeDefined()
})

test('outside the fullscreen layout a created task gets one line, not a board', async ($, on) => {
  const { opens, logs } = fakeEngine(on, {}, { CLAUDE_CODE_NO_FLICKER: '0' })
  await $.session.start(SESSION)
  await createTask($)
  expect(opens).toEqual([])
  expect(logs).toContain('supermanager: task T-001 created · type /supermanager to see the board')
})
