import { skillCall } from './skills'

// Testing like a user (setting offScreen): each teammate tests and records in its own environment,
// off the user's screen when the setting is on, and reports any new bug it sees to the lead, who tells
// the user. register.tsx asks the question (askToTurnOn, once per project) and adds the rules to the prompts;
// the how-to per kind of app is the testing skill (skills/testing/SKILL.md).

/** The project setting, in .claude/tasks/config.json: unset means this project was not asked yet. */
export const OFFSCREEN_FIELD = 'offScreen'

export const OFFSCREEN_QUESTION =
  'Should teammates test in the background, so your screen, mouse and keyboard stay yours?'

/** The teammate's prompt keeps the boundaries and the bug report; the recipes are the testing skill. */
export function testingPointer(isOffScreen: boolean): string {
  const screen = isOffScreen ? ", nor their screen, mouse or keyboard (off-screen is on)" : ''
  return `## Testing like a user
- Test your change as a user would, in your own environment: never the user's running apps, data or accounts${screen}. Before you first run, test or capture the app (a BEFORE capture too), load the \`${skillCall('testing')}\` skill: how, per kind of app.
- A new bug you notice, even outside your task: don't fix it unasked. Send the lead one line, "New bug: <what you saw>, <how to see it again>".`
}

/** What the testing skill reads under its title: whether its "Off-screen" or its "On the screen" part applies. */
export function testingSkillSettings(isOffScreen: boolean): string {
  return isOffScreen
    ? '- Off-screen: on. Follow "Off-screen"; the user\'s screen, mouse and keyboard stay theirs.'
    : '- Off-screen: off. Follow "On the screen".'
}

export function coordinatorTestingRules(isOffScreen: boolean): string {
  const waits = isOffScreen
    ? '\n- Off-screen is on: a teammate that needs the user\'s screen (a real click in a Mac app) waits. Ask the user when it may, or run it while they are away.'
    : ''
  return `## New bugs from testing
- A teammate reports "New bug: ...": tell the user in one line in your next message (what, and how to see it), and ask whether to file it. File it (task_create) only when they say so.${waits}`
}
