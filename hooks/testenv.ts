// Testing like a user (setting offScreen): each teammate tests and records in its own environment,
// off the user's screen when the setting is on, and reports any new bug it sees to the lead, who tells
// the user. register.tsx asks the question (askToTurnOn, once per project) and adds the rules to the prompts.

/** The project setting, in .claude/tasks/config.json: unset means this project was not asked yet. */
export const OFFSCREEN_FIELD = 'offScreen'

export const OFFSCREEN_QUESTION =
  'Should teammates test and record off-screen, so your screen, mouse and keyboard stay yours while you work? ' +
  'Web pages run in a hidden browser, iOS and Android in hidden simulators, terminal apps in a hidden terminal. ' +
  'Mac apps run in the background, on a virtual display if you have one, driven without your pointer; a step that needs a real click waits until you are away. ' +
  'Change it later in /better-tasks config.'

const OWN_ENVIRONMENT = `## Testing like a user
- Test your change as a user would: run it, go through the steps, look at the result. Passing tests alone don't count.
- Your own test environment: your own app instance on its own port, its own data (a fresh database, browser profile or simulator, kept in your scratchpad), never the user's running apps, data or accounts, nor another teammate's. When done, stop what you started (servers, simulators).
- iPhone/iOS apps: build, run and test through Xcode's own tools (its MCP server; Apple: https://developer.apple.com/documentation/xcode/giving-external-agents-access-to-xcode). Not set up (no xcode tools among yours)? Tell the lead it takes: Xcode > Settings > Intelligence > "Allow external agents to use Xcode tools", then \`claude mcp add --transport stdio xcode -- xcrun mcpbridge\`, with the project open in Xcode. Until then: \`xcodebuild\` and \`xcrun simctl\`.
- A new bug you notice, even outside your task: don't fix it unasked. Send the lead one line, "New bug: <what you saw>, <how to see it again>", plus a screenshot path if you have one.`

const OFF_SCREEN = `## Off-screen (on in this project): the user's screen, mouse and keyboard stay theirs
- Web: a headless browser in a Playwright script: \`chromium.launch({ headless: true })\`, a context with \`viewport\` and \`recordVideo\` at the video's size. Not the Playwright MCP: it opens a window.
- iOS: your own simulator, booted without the Simulator app: \`xcrun simctl create\` / \`xcrun simctl boot <udid>\` (never \`open -a Simulator\`); \`xcrun simctl io <udid> screenshot <png>\` / \`recordVideo <mp4>\`; \`xcrun simctl shutdown <udid>\` when done.
- Android: \`emulator -avd <name> -no-window\`; \`adb exec-out screencap -p\`, \`adb shell screenrecord\`.
- Terminal apps: a detached tmux session (\`tmux new -d -s <name> -x 160 -y 45\`), \`tmux send-keys\` to type, \`tmux capture-pane -p -e\` to read the screen.
- Linux desktop apps: \`xvfb-run\`.
- Mac apps: launch without focus (NSWorkspace openApplication with activates = false, or \`open -g\`), move the window to a virtual display (BetterDisplay's, if the user has one) through Accessibility, press buttons and menus with Accessibility actions (AXPress), type with key events posted to the app's process only (CGEvent postToPid), read values through Accessibility, capture the window alone: \`screencapture -x -o -l <window id>\`. No real click (it moves the user's pointer) and no keys to the front app. A step that only works with a real click: tell the lead, who asks the user or waits until they are away.
- Never: \`screencapture\` of a whole screen, \`open\` of an app or URL without -g, AppleScript clicks or keystrokes.`

const ON_SCREEN = `## Using the screen
- Off-screen first when the tool allows it (a headless browser, a simulator without its window). Need the user's screen, mouse or keyboard? Tell the lead first: the user may be working.`

export function testingRules(isOffScreen: boolean): string {
  return [OWN_ENVIRONMENT, isOffScreen ? OFF_SCREEN : ON_SCREEN].join('\n\n')
}

export function coordinatorTestingRules(isOffScreen: boolean): string {
  const waits = isOffScreen
    ? '\n- Off-screen is on: a teammate that needs the user\'s screen (a real click in a Mac app) waits. Ask the user when it may, or run it while they are away.'
    : ''
  return `## New bugs from testing
- A teammate reports "New bug: ...": tell the user in one line in your next message (what, and how to see it), and ask whether to file it. File it (task_create) only when they say so.${waits}`
}
