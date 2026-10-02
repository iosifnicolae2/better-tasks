import type { EngineInterface, On, PluginOptions } from 'claude-code'

import { settingsOf } from './settings'
import { isActive } from './team'

// Screen off, Mac awake: /away and the screen_off tool black out every screen
// until the user is back; keepAwake holds the Mac awake while teammates run.

const AWAKE_CHECK_SECONDS = 30
const team = { plugin: 'supermanager', key: 'team' } as const
const BACK_TEXT = 'Screens are black and the Mac stays awake. Move the mouse or press a key to come back.'
const FALLBACK_TEXT = 'Could not black out the screens, so they went to sleep instead. The Mac may lock.'

export const blackoutArgv = (root: string) =>
  ['caffeinate', '-d', '-i', '-s', 'osascript', '-l', 'JavaScript', `${root}/bin/blackout.js`]

/** A short hold, renewed on every check, so it lapses on its own once nobody runs. */
export const keepAwakeArgv = ['caffeinate', '-i', '-s', '-t', String(2 * AWAKE_CHECK_SECONDS)]

export function registerScreen(on: On, options: PluginOptions): void {
  const { keepAwake } = settingsOf(options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'away', description: 'Turn the screens off while the Mac stays awake' })
    await $.tool.register({
      name: 'screen_off',
      description: 'Blacks out every screen while the Mac stays awake, until the user moves the mouse or '
        + 'presses a key. Call it when the user says they are leaving and wants the screen off.',
    })
    if (keepAwake) $.clock.every(AWAKE_CHECK_SECONDS * 1000, () => void holdAwakeIfTeamRuns($))
    return started
  })

  on('command.run', { command: 'away' }, async $ => ({ text: await screenOff($) }))
  on('tool.call', { tool: 'mcp__supermanager__screen_off' }, async $ => ({ result: await screenOff($) }))
}

async function screenOff($: EngineInterface): Promise<string> {
  if (await startBlackout($)) return BACK_TEXT
  await $.process.run(['pmset', 'displaysleepnow'])
  $.ui.toast(FALLBACK_TEXT)
  return FALLBACK_TEXT
}

/** Starts the blackout; resolves true once it says the screens are black. */
function startBlackout($: EngineInterface): Promise<boolean> {
  return new Promise(resolve => {
    void (async () => {
      for await (const { text } of $.process.spawn({ argv: blackoutArgv($.plugin.root) })) {
        if (text.includes('black')) resolve(true)
      }
      resolve(false)
    })().catch(() => resolve(false))
  })
}

async function holdAwakeIfTeamRuns($: EngineInterface): Promise<void> {
  const { value: mates = [] } = await $.state.get(team)
  if (!mates.some(isActive)) return
  for await (const _ of $.process.spawn({ argv: keepAwakeArgv })) void _
}
