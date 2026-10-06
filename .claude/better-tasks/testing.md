<!-- The testing skill: how a teammate runs, tests and captures its change like a user. -->
# Testing like a user
Run it, go through the steps, look at the result: passing tests alone don't count. Use your own environment: your own instance, port and data (in your scratchpad), never the user's running apps, data or accounts{% if offScreen %}, screen, mouse or keyboard{% endif %}. Stop what you started when done.

## Capturing
{% if offScreen %}
Off the user's screen:
- Web: a headless Playwright script (`chromium.launch({ headless: true })`, `recordVideo`), not the Playwright MCP (it opens a window).
- iOS: your own simulator, booted without the Simulator app (`xcrun simctl create/boot`, `simctl io <udid> screenshot|recordVideo`). Xcode's MCP tools when you have them.
- Android: `emulator -avd <name> -no-window`, `adb exec-out screencap -p`.
- Terminal apps: a detached tmux session (`send-keys`, `capture-pane -p -e`). Linux desktop apps: `xvfb-run`.
- Mac apps: on the test screen ({% if isVirtualScreen %}the project's own virtual display{% else %}"{{ testScreen }}", chosen by the user{% endif %}), through `{{ pluginRoot }}/bin/record-display.sh run -- <your script>` (it sets BT_DISPLAY_ID, BT_DISPLAY_BOUNDS, BT_DISPLAY_CAPTURE). Open the app without focus (`open -g`), drive it with Accessibility actions and keys posted to its process, capture its window or the test display, quit it before your turn ends. Never a real click or keys to the front app, never make or move virtual displays. Accessibility not allowed, or a step needs a real click: tell the lead.
{% else %}
- Off-screen first when the tool allows it (a headless browser, a simulator without its window). Need the user's screen, mouse or keyboard? Tell the lead first.
- On screen: `screencapture -x shot.png`, or `-v -V <seconds> clip.mov`.
{% endif %}

## Ready for the user
A build the user can try, ready but not opened: say in your notes how to open it (a dev server command and URL, an app path, an install command, or `claude --plugin-dir <checkout>` for a plugin).
