import type { GitFlow } from './gitflow'
import { skillCall } from './skills'

// Testing like a user (setting offScreen): each teammate tests and records in its own environment,
// off the user's screen when the setting is on, and reports any new bug it sees to the lead, who files it:
// every bug fix comes with a before/after video and a PR the user sees before it merges. register.tsx asks the question (askToTurnOn, once per project) and adds the rules to the prompts;
// the how-to per kind of app is the testing skill (skills/testing/SKILL.md).
// Mac apps run on the project's test screen (setting testScreen): its own virtual display by default, or a real
// screen the user picked on the settings page; bin/record-display.sh reads the choice and falls back when it is gone.

export const VIRTUAL_SCREEN = 'virtual'

/** The teammate's prompt keeps the boundaries and the bug report; the recipes are the testing skill. */
export function testingPointer(isOffScreen: boolean): string {
  const screen = isOffScreen ? ", nor their screen, mouse or keyboard (off-screen is on)" : ''
  return `## Testing like a user
- Test your change as a user would, in your own environment: never the user's running apps, data or accounts${screen}. Before you first run, test or capture the app (a BEFORE capture too), load the \`${skillCall('testing')}\` skill: how, per kind of app.
- A bug your own change made is part of your task: fix it there.
- Any other bug you notice, even outside your task: don't fix it unasked. Capture it first (a screenshot per step: its BEFORE), then send the lead one line, "New bug: <what you saw>, <how to see it again>, BEFORE: <path>". It gets fixed with a before/after video and a PR the user sees.`
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

/** Where a bug's fix merges: into the branch of the open task it came from, else into main; straight to main has no task branch. */
function bugMergeLine(flow: GitFlow): string {
  if (flow === 'direct') {
    return '- Straight to main has no task branch: the fix is its own task and PR into main. Spawn its teammate with isolation "worktree": it works on its own branch and opens the PR with its video; your "Git flow" rules merge it.'
  }
  const land = flow === 'dev-prs' ? 'lands it on the dev branch and runs task_pr.py open again' : 'pushes it to its branch'
  return `- It came from a task whose PR is still open: its owner fixes it in that task (${land}), so the fix merges into that task's branch, shown in its PR and a new video. Else: its own task, its own PR into main.`
}

export function coordinatorTestingRules(isOffScreen: boolean, flow: GitFlow): string {
  const waits = isOffScreen
    ? '\n- Off-screen is on: a teammate that needs the user\'s screen (a real click in a Mac app) waits. Ask the user when it may, or run it while they are away.'
    : ''
  return `## New bugs from testing
- A teammate reports "New bug: ...": every bug gets fixed with a before/after video and a PR the user sees before it merges (the user asked for this). File it (task_create; the teammate's line and its BEFORE path in the goal), tell the user in one line in your next message (what, how to see it, the task id), and hand it out like any task.
${bugMergeLine(flow)}${waits}`
}
