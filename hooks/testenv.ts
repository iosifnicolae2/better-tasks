import { skillCall } from './skills'

// Testing like a user (setting offScreen): each teammate tests and records in its own environment,
// off the user's screen when the setting is on, and reports any new bug it sees to the lead, who tells
// the user. register.tsx asks the question (askToTurnOn, once per project) and adds the rules to the prompts;
// the how-to per kind of app is the testing skill (skills/testing/SKILL.md).
// Mac apps run on the project's test screen (setting testScreen): its own virtual display by default, or a real
// screen the user picked on the settings page; bin/record-display.sh reads the choice and falls back when it is gone.

export const VIRTUAL_SCREEN = 'virtual'

/** The teammate's prompt keeps the boundaries and the bug report; the recipes are the testing skill. */
export function testingPointer(isOffScreen: boolean): string {
  const screen = isOffScreen ? ", nor their screen, mouse or keyboard (off-screen is on)" : ''
  return `## Testing like a user
- Test your change as a user would, in your own environment: never the user's running apps, data or accounts${screen}. Before you first run, test or capture the app (a BEFORE capture too), load the \`${skillCall('testing')}\` skill: how, per kind of app.
- A new bug you notice, even outside your task: don't fix it unasked. Send the lead one line, "New bug: <what you saw>, <how to see it again>".`
}

/** What the testing skill reads under its title: whether its "Off-screen" or its "On the screen" part applies. */
export function testingSkillSettings(isOffScreen: boolean, testScreen = VIRTUAL_SCREEN): string {
  const offScreen = isOffScreen
    ? '- Off-screen: on. Follow "Off-screen"; the user\'s screen, mouse and keyboard stay theirs.'
    : '- Off-screen: off. Follow "On the screen".'
  return `${offScreen}\n${testScreenLine(testScreen)}`
}

function testScreenLine(testScreen: string): string {
  return testScreen === VIRTUAL_SCREEN
    ? "- Test screen: the project's own virtual display (record-display.sh)."
    : `- Test screen: "${testScreen}", a real screen the user chose; record-display.sh uses it.`
}

// ---- The real screens, for the settings page's "Test screen" row ----

/** How long a listing of the screens stays fresh. */
export const SCREENS_FRESH_MS = 30_000

/** The real screens' names from "<id><tab><name>" lines (record-display.sh screens). */
export function screenNames(listing: string): string[] {
  return listing.split('\n').map(line => line.split('\t')[1]?.trim() ?? '').filter(Boolean)
}

export const screensArgv = (root: string) => ['/bin/sh', `${root}/bin/record-display.sh`, 'screens']

export function coordinatorTestingRules(isOffScreen: boolean): string {
  const waits = isOffScreen
    ? '\n- Off-screen is on: a teammate that needs the user\'s screen (a real click in a Mac app) waits. Ask the user when it may, or run it while they are away.'
    : ''
  return `## New bugs from testing
- A teammate reports "New bug: ...": tell the user in one line in your next message (what, and how to see it), and ask whether to file it. File it (task_create) only when they say so.${waits}`
}
