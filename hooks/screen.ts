import type { CommandSpec, EngineInterface, On, PluginOptions, ToolSpec } from 'claude-code'

import type { Teammate } from '../types'
import { settingsOf } from './settings'
import { isActive } from './team'

// Screen off, Mac awake: /away and the screen_off tool turn the physical screens off
// until the user is back; virtual displays stay on for teammates' tests and recordings.
// keepAwake holds the Mac awake while teammates run.

const BACK_TEXT = 'Screens are off and the Mac stays awake. Move the mouse or press a key to turn them back on.'
const FALLBACK_TEXT = 'Could not turn the screens off, so they went to sleep instead. The Mac may lock.'
const KEPT_ON_TEXT = 'Could not turn the screens off. They stay on, since display sleep would stop the virtual displays teammates test on.'
const HOLD_SECONDS = 120 // outlasts the team's one-minute refresh, then lapses on its own
const RENEW_AFTER_MS = 30_000

export const SCREEN_COMMANDS: CommandSpec[] = [
  { name: 'away', description: 'Turn the screens off while the Mac stays awake' },
]

export const SCREEN_TOOLS: ToolSpec[] = [{
  name: 'screen_off',
  description: 'Turns the physical screens off while the Mac stays awake, until the user moves the mouse or '
    + 'presses a key; virtual displays stay on. Call it when the user says they are leaving and wants the screen off.',
}]

/** Starts the blackout detached (a reload can't cut it off) and prints "black" once the screens are dark,
 *  else "failed: why", plus "virtual displays on" when display sleep would stop them. */
export const awayArgv = (root: string) => ['/bin/sh', `${root}/bin/away.sh`]

export const keepAwakeArgv = ['caffeinate', '-i', '-s', '-t', String(HOLD_SECONDS)]

export function registerScreen(on: On, options: PluginOptions): void {
  const { keepAwake } = settingsOf(options)
  let heldAt = -Infinity

  on('command.run', { command: 'away' }, async $ => ({ text: await screenOff($) }))
  on('tool.call', { tool: 'mcp__better-tasks__screen_off' }, async $ => ({ result: await screenOff($) }))

  // Each publish of the team renews a short hold while anyone runs.
  on('state.set', { plugin: 'better-tasks', key: 'team' }, async ($, e, next) => {
    const written = await next(e)
    const now = await $.clock.now()
    if (holdIsDue({ keepAwake, team: e.value as Teammate[], now, heldAt })) {
      heldAt = now
      void drain($.process.spawn({ argv: keepAwakeArgv })).catch(() => undefined)
    }
    return written
  })
}

export function holdIsDue(hold: { keepAwake: boolean; team: Teammate[]; now: number; heldAt: number }): boolean {
  return hold.keepAwake && hold.team.some(isActive) && hold.now - hold.heldAt >= RENEW_AFTER_MS
}

async function screenOff($: EngineInterface): Promise<string> {
  const { stdout } = await $.process.run(awayArgv($.plugin.root))
  if (stdout.startsWith('black')) return BACK_TEXT
  const text = stdout.includes('virtual displays on') ? KEPT_ON_TEXT : FALLBACK_TEXT
  if (text === FALLBACK_TEXT) await $.process.run(['pmset', 'displaysleepnow'])
  $.ui.toast(text)
  return text
}

async function drain(output: AsyncIterable<unknown>): Promise<void> {
  for await (const _ of output) void _
}
