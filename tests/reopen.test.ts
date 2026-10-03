import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const ROOT = '/project'
const SESSION = { cwd: ROOT, surface: 'terminal', isInteractive: true } as const
const PANE_ID = 'supermanager-sprint'

/** Just enough engine for a session to start, and a record of every pane it was asked to open. */
function fakeEngine(on: On, stored: Record<string, unknown>) {
  const opens: { id: string; focus?: true }[] = []
  const files = new Map<string, string>()
  mock.clock(on, { now: new Date(2026, 9, 7, 12).getTime() })
  mock.store(on, stored)
  mock.env(on, { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' })
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
  on('ui.log', () => ({ value: undefined }))
  on('fs.read', ($, e) => (files.has(e.path) ? { value: files.get(e.path) ?? '' } : { deny: `ENOENT ${e.path}` }))
  on('fs.write', ($, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.list', () => ({ value: [] }))
  on('process.spawn', async function* () {
    return { value: { code: 0, signal: null } }
  })
  on('ui.open', ($, e) => {
    opens.push(e)
    return { value: { isPlaced: true as const } }
  })
  return { opens }
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
