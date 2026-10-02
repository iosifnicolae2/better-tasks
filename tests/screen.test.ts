import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import type { Teammate } from '../types'

const SESSION = { cwd: '/project', surface: 'terminal', isInteractive: true } as const
const AWAY = {
  command: 'away',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 80 },
} as const

/** Answers the engine's side of the session; records every command the plugin starts. */
function fakeHost(on: On, team: Teammate[] = [], blackoutSays = 'black\n') {
  const spawned: string[][] = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__supermanager__${e.name}` } }))
  on('state.get', () => ({ value: { value: team, version: 1 } }))
  on('process.run', ($, e) => {
    spawned.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('process.spawn', async function* ($, e) {
    spawned.push([...e.argv])
    if (e.argv.includes('osascript')) yield { stream: 'stdout' as const, text: blackoutSays }
    return { value: { code: 0, signal: null } }
  })
  return spawned
}

const mate = (status: string): Teammate => ({ id: 'a1', name: 'mod-ui', status })

test('/away runs the blackout under caffeinate', async ($, on) => {
  const spawned = fakeHost(on)
  await $.session.start(SESSION)
  const { text } = await $.command.run(AWAY)
  expect(text).toContain('Screens are black')
  const blackout = spawned.find(argv => argv.includes('osascript'))
  expect(blackout?.slice(0, 7)).toEqual(['caffeinate', '-d', '-i', '-s', 'osascript', '-l', 'JavaScript'])
  expect(blackout?.[7]).toMatch(/\/bin\/blackout\.js$/)
})

test('the screen_off tool does what /away does', async ($, on) => {
  const spawned = fakeHost(on)
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'mcp__supermanager__screen_off', tool_use_id: 't1' })
  expect(spawned.some(argv => argv.includes('osascript'))).toBe(true)
})

test('when the blackout fails, the displays sleep instead', async ($, on) => {
  const spawned = fakeHost(on, [], 'failed: no screens\n')
  await $.session.start(SESSION)
  const { text } = await $.command.run(AWAY)
  expect(text).toContain('may lock')
  expect(spawned).toContainEqual(['pmset', 'displaysleepnow'])
})

test('keepAwake holds caffeinate while a teammate runs', async ($, on) => {
  const clock = mock.clock(on)
  const spawned = fakeHost(on, [mate('running')])
  await $.session.start(SESSION)
  await clock.advance(30_000)
  expect(spawned).toContainEqual(['caffeinate', '-i', '-s', '-t', '60'])
})

test('keepAwake holds nothing when no teammate runs', async ($, on) => {
  const clock = mock.clock(on)
  const spawned = fakeHost(on, [mate('completed')])
  await $.session.start(SESSION)
  await clock.advance(30_000)
  expect(spawned.filter(argv => argv[0] === 'caffeinate')).toEqual([])
})

test('keepAwake off holds nothing', { options: { keepAwake: false } }, async ($, on) => {
  const clock = mock.clock(on)
  const spawned = fakeHost(on, [mate('running')])
  await $.session.start(SESSION)
  await clock.advance(30_000)
  expect(spawned.filter(argv => argv[0] === 'caffeinate')).toEqual([])
})
