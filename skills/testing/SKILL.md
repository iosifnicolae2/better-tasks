---
name: testing
user-invocable: false
description: How a better-tasks teammate tests its change like a user, in its own environment, off the user's screen when the project says so (web, iOS, Android, terminal, Linux and Mac apps). Load it before you run, test or capture the app.
---

# Testing like a user
- Test your change as a user would: run it, go through the steps, look at the result. Passing tests alone don't count.
- Your own test environment: your own app instance on its own port, its own data (a fresh database, browser profile or simulator, kept in your scratchpad), never the user's running apps, data or accounts, nor another teammate's. When done, stop what you started (servers, simulators).
- iPhone/iOS apps: build, run and test through Xcode's own tools (its MCP server; Apple: https://developer.apple.com/documentation/xcode/giving-external-agents-access-to-xcode). Not set up (no xcode tools among yours)? Tell the lead it takes: Xcode > Settings > Intelligence > "Allow external agents to use Xcode tools", then `claude mcp add --transport stdio xcode -- xcrun mcpbridge`, with the project open in Xcode. Until then: `xcodebuild` and `xcrun simctl`.
- A new bug you notice, even outside your task: don't fix it unasked. Send the lead one line, "New bug: <what you saw>, <how to see it again>", plus a screenshot path if you have one.

## Off-screen: when "Settings" above says it is on
The user's screen, mouse and keyboard stay theirs.
- Web: a headless browser in a Playwright script: `chromium.launch({ headless: true })`, a context with `viewport` and `recordVideo` at the video's size. Not the Playwright MCP: it opens a window.
- iOS: your own simulator, booted without the Simulator app: `xcrun simctl create` / `xcrun simctl boot <udid>` (never `open -a Simulator`); `xcrun simctl io <udid> screenshot <png>` / `recordVideo <mp4>`; `xcrun simctl shutdown <udid>` when done.
- Android: `emulator -avd <name> -no-window`; `adb exec-out screencap -p`, `adb shell screenrecord`.
- Terminal apps: a detached tmux session (`tmux new -d -s <name> -x 160 -y 45`), `tmux send-keys` to type, `tmux capture-pane -p -e` to read the screen.
- Linux desktop apps: `xvfb-run`.
- Mac apps: launch without focus (NSWorkspace openApplication with activates = false, or `open -g`), move the window to a virtual display (BetterDisplay's, if the user has one) through Accessibility, press buttons and menus with Accessibility actions (AXPress), type with key events posted to the app's process only (CGEvent postToPid), read values through Accessibility, capture the window alone: `screencapture -x -o -l <window id>`. No real click (it moves the user's pointer) and no keys to the front app. A step that only works with a real click: tell the lead, who asks the user or waits until they are away.
- Never: `screencapture` of a whole screen, `open` of an app or URL without -g, AppleScript clicks or keystrokes.

## On the screen: when off-screen is off
- Off-screen first when the tool allows it (a headless browser, a simulator without its window: the recipes above). Need the user's screen, mouse or keyboard? Tell the lead first: the user may be working.
