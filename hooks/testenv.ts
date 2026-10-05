// Testing like a user (setting offScreen): each teammate tests and records in its own environment,
// off the user's screen when the setting is on, and reports any new bug it sees to the lead, who tells
// the user. The parts that need `$` (the startup question, the prompts) are in register.tsx.

/** The project setting, in .claude/tasks/config.json: unset means this project was not asked yet. */
export const OFFSCREEN_FIELD = 'offScreen'
export const OFFSCREEN_YES = 'Off-screen (recommended)'
export const OFFSCREEN_NO = 'On my screen is fine'

export const OFFSCREEN_QUESTION =
  'Should teammates test and record off-screen, so your screen, mouse and keyboard stay yours while you work? ' +
  'Web pages run in a hidden browser, iOS and Android in hidden simulators, terminal apps in a hidden terminal. ' +
  'A Mac app that needs clicks waits until you are away. Change it later in /better-tasks config.'

const OWN_ENVIRONMENT = `## Testing like a user
- Test your change as a user would: run it, go through the steps, look at the result. Passing tests alone don't count.
- Your own test environment: your own app instance on its own port, its own data (a fresh database, browser profile or simulator, kept in your scratchpad), never the user's running apps, data or accounts, nor another teammate's. When done, stop what you started (servers, simulators).
- A new bug you notice, even outside your task: don't fix it unasked. Send the lead one line, "New bug: <what you saw>, <how to see it again>", plus a screenshot path if you have one.`

const OFF_SCREEN = `## Off-screen (on in this project): the user's screen, mouse and keyboard stay theirs
- Web: a headless browser in a Playwright script: \`chromium.launch({ headless: true })\`, a context with \`viewport\` and \`recordVideo\` at the video's size. Not the Playwright MCP: it opens a window.
- iOS: your own simulator, booted without the Simulator app: \`xcrun simctl create\` / \`xcrun simctl boot <udid>\` (never \`open -a Simulator\`); \`xcrun simctl io <udid> screenshot <png>\` / \`recordVideo <mp4>\`; \`xcrun simctl shutdown <udid>\` when done.
- Android: \`emulator -avd <name> -no-window\`; \`adb exec-out screencap -p\`, \`adb shell screenrecord\`.
- Terminal apps: a detached tmux session (\`tmux new -d -s <name> -x 160 -y 45\`), \`tmux send-keys\` to type, \`tmux capture-pane -p -e\` to read the screen.
- Linux desktop apps: \`xvfb-run\`.
- A Mac app that needs clicks or typing can't run off-screen: clicks move the user's pointer and keys go to the front app. Don't do it; tell the lead, who asks the user or waits until they are away.
- Never: \`screencapture\` of the screen, \`open\` of an app or a URL, AppleScript clicks or keystrokes.`

const ON_SCREEN = `## Using the screen
- Off-screen first when the tool allows it (a headless browser, a simulator without its window). Need the user's screen, mouse or keyboard? Tell the lead first: the user may be working.`

/** The answer as the project's offScreen value; undefined (dismissed) asks again next session. */
export function offScreenAnswer(answer: string | undefined): boolean | undefined {
  if (answer === OFFSCREEN_YES) return true
  if (answer === OFFSCREEN_NO) return false
  return undefined
}

export function testingRules(isOffScreen: boolean): string {
  return [OWN_ENVIRONMENT, isOffScreen ? OFF_SCREEN : ON_SCREEN].join('\n\n')
}

export function coordinatorTestingRules(isOffScreen: boolean): string {
  const waits = isOffScreen
    ? '\n- Off-screen is on: a teammate that needs the user\'s screen (a Mac app to click through) waits. Ask the user when it may, or run it while they are away.'
    : ''
  return `## New bugs from testing
- A teammate reports "New bug: ...": tell the user in one line in your next message (what, and how to see it), and ask whether to file it. File it (task_create) only when they say so.${waits}`
}
