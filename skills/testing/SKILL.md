---
name: testing
user-invocable: false
description: How a better-tasks teammate tests its change like a user, in its own environment, off the user's screen when the project says so (web, iOS, Android, terminal, Linux and Mac apps). Load it before you run, test or capture the app.
---

# Testing like a user
- Test your change as a user would: run it, go through the steps, look at the result. Passing tests alone don't count.
- Before done, quick checks only: the tests near your change. The full suite runs at the finish, after the user accepts (the `better-tasks:done` skill).
- Your own test environment: your own app instance on its own port, its own data (a fresh database, browser profile or simulator, kept in your scratchpad), never the user's running apps, data or accounts, nor another teammate's. When done, stop what you started (servers, simulators).
- iPhone/iOS apps: build, run and test through Xcode's own tools (its MCP server; Apple: https://developer.apple.com/documentation/xcode/giving-external-agents-access-to-xcode). Not set up (no xcode tools among yours)? Tell the lead it takes: Xcode > Settings > Intelligence > "Allow external agents to use Xcode tools", then `claude mcp add --transport stdio xcode -- xcrun mcpbridge`, with the project open in Xcode. Until then: `xcodebuild` and `xcrun simctl`.
- A new bug you notice, even outside your task: don't fix it unasked. Send the lead one line, "New bug: <what you saw>, <how to see it again>", plus a screenshot path if you have one.

## Local build for the user
At done, leave a build the user can try right away, on their machine or device: the one thing you start for them, not in your own test environment. Say in your notes how to stop or remove it.
- Web: your dev server left running on its own port; its URL is the link.
- iOS / Android: installed on the user's device (`xcrun devicectl device install app --device <id> <app>`, `adb install -r <apk>`), else on a simulator or emulator they can see.
- Mac app: the built .app's path; the user opens it.
- Terminal app or CLI: the command that runs your build.
- A Claude Code plugin (better-tasks itself): the user's linked install (the `better-tasks:contribute` skill) runs your checkout: they run /reload-plugins. Your work is in a worktree? Give them `claude --plugin-dir <worktree>` for a new session.

## Off-screen: when "Settings" above says it is on
The user's screen, mouse and keyboard stay theirs.
- Web: a headless browser in a Playwright script: `chromium.launch({ headless: true })`, a context with `viewport` and `recordVideo` at the video's size. Not the Playwright MCP: it opens a window.
- iOS: your own simulator, booted without the Simulator app: `xcrun simctl create` / `xcrun simctl boot <udid>` (never `open -a Simulator`); `xcrun simctl io <udid> screenshot <png>` / `recordVideo <mp4>`; `xcrun simctl shutdown <udid>` when done.
- Android: `emulator -avd <name> -no-window`; `adb exec-out screencap -p`, `adb shell screenrecord`.
- Terminal apps: a detached tmux session (`tmux new -d -s <name> -x 160 -y 45`), `tmux send-keys` to type, `tmux capture-pane -p -e` to read the screen.
- Linux desktop apps: `xvfb-run`.
- Mac apps: on your project's own virtual display, one recording at a time: `${CLAUDE_PLUGIN_ROOT}/bin/record-display.sh run -- <your script>` (over several commands: `start`, then `stop <pid>`). It waits while another recording in the project has the display, and sets BT_DISPLAY_ID, BT_DISPLAY_BOUNDS ("x y w h") and BT_DISPLAY_CAPTURE. The display is made once and kept below the user's screens: never make, move or remove virtual displays yourself.
  - Launch the app without focus (NSWorkspace openApplication with activates = false, or `open -g`), move its window into BT_DISPLAY_BOUNDS through Accessibility, press buttons and menus with Accessibility actions (AXPress), type with key events posted to the app's process only (CGEvent postToPid), read values through Accessibility.
  - Capture the window alone (`screencapture -x -o -l <window id>`) or the display (`screencapture -x -D "$BT_DISPLAY_CAPTURE" shot.png`; video: `-v -V <seconds>`). Quit the app before the turn ends, or its windows land on the user's screens.
  - No real click (it moves the user's pointer) and no keys to the front app. Accessibility not allowed for you (AXIsProcessTrusted is false)? Tell the lead: the user allows it once. A step that only works with a real click: tell the lead, who asks the user or waits until they are away.
- Never: `screencapture` of a whole screen, `open` of an app or URL without -g, AppleScript clicks or keystrokes.

## On the screen: when off-screen is off
- Off-screen first when the tool allows it (a headless browser, a simulator without its window: the recipes above). Need the user's screen, mouse or keyboard? Tell the lead first: the user may be working.
