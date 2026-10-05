---
id: T-022
title: Teammates test and record in their own environment (virtual display option), flag new bugs to the user
sprint: 2026-10-05
urgent: false
status: done
owner: pr-videos
rolled: 0
order: -4
created: 2026-10-05
---
## Goal
User's words: "also, for testing and recording the video, ask the user if he wants to be done on a virtual display to not interrupt you.. also instruct the teammates to create their own testing environment to record the video and test the implementation like a user.. any new observed bug will be flagged to the user"

Goal:
1. Ask the user (once, e.g. on first start or in the video settings; saved as a project setting) whether testing and video recording should run on a virtual display (an off-screen display), so it doesn't take over the user's screen, mouse or keyboard while they work. Find what really works on macOS (and other OSes) for this; say plainly what can't be done.
2. Teammate rules: each teammate sets up its own test environment (its own app instance, data, ports, display) to test the implementation like a real user and record the before/after video, without disturbing the user's running apps or other teammates.
3. Any new bug a teammate notices while testing (even outside its task) is flagged to the user: reported to the lead, who tells the user (and files it when the user wants).

Done: the setting/question exists, the teammate rules say this, and one real recording made on the virtual display (if supported) doesn't touch the user's screen. Explain in plain words what changed and how to check it.

## Notes
Video: [T-022.mp4](../tasks_videos/T-022.mp4)
- 2026-10-05: Part 1 done: 5f9906b on branch task-T-022 (worktree agent-a44f2b13676d21f60, not pushed): hooks/testenv.ts (teammate rules: own test env, off-screen recipes, "New bug:" line to the lead; lead rule: tell the user, file only when asked; the per-project question OFFSCREEN_QUESTION with OFFSCREEN_YES/NO and offScreenAnswer -> config.json `offScreen`, unset = not asked) + tests/testenv.test.ts (227 pass).
- What works off-screen on macOS (checked here): headless Playwright script recorded a 1920x1080 page, no window (scratchpad t022/headless-record.mjs); iOS simulator booted with `xcrun simctl boot` + `simctl io recordVideo/screenshot`, Simulator app never opened (t022/sim-headless.sh); tmux detached + send-keys + capture-pane. Not checked: Android `-no-window` (no emulator here), mobile MCP taps on a windowless simulator, xvfb (Linux).
- Can't be done: a native Mac app that needs clicks/typing. Clicks move the user's one pointer; keys go to the front app. A virtual display (BetterDisplay, or the private CGVirtualDisplay API) only hides the window, not the pointer. Only a macOS VM (e.g. tart) isolates it fully: heavy, left out. The Playwright MCP opens a window, so off-screen says use a headless script.
- Waiting (lead's call): T-024 is changing settings.ts, plugin.json, configpage.tsx, register.tsx. After it lands: setting `offScreen` (project config.json, asked once per project at session start with T-024's writer), "Test off-screen" row after "Video quality", testingRules(settings.offScreen) in the spawn prompt, coordinatorTestingRules in the lead rules. Then the video (BEFORE render at scratchpad t022/before.png) and the PR.
- 2026-10-05: Lead: before concluding "a Mac app needing clicks can't be off-screen", check real virtual-display options on macOS: CGVirtualDisplay (the API BetterDisplay/DeskPad use to create a virtual monitor; window moved there, recorded with screencapture -D or ScreenCaptureKit), DeskPad/BetterDisplay if installed, or a macOS VM. The user asked specifically for a virtual display, so say plainly what works and what it needs (installs, permissions).
- 2026-10-05: Virtual display checked (replaces the "Can't be done" note above): this Mac already has BetterDisplay with a virtual display "Test screen" (2992x1934, displayID 6). Test (scratchpad t022/vdisplay.swift): TextEdit opened without focus (activates=false), File > New pressed via AXPress, window moved onto the virtual display via Accessibility, text typed with CGEvent postToPid, read back via AX, captured alone with `screencapture -x -o -l <window id>` (t022/window.png). Pointer unchanged, no app activated, front app unchanged. So Mac apps CAN be tested off-screen.
  - Needs: Accessibility permission for the process doing it (the terminal running Claude Code; it had it here), Screen Recording for screencapture, a virtual display (BetterDisplay, or DeskPad; the private CGVirtualDisplay API underneath). Without a virtual display the same works with the window behind others; -l still captures it.
  - Limits: a real click (CGEvent mouse) moves the user's single pointer, so only AX actions; apps with custom-drawn UI (games, some Electron/canvas) may expose no AX buttons. The virtual display is part of the desktop: the user's pointer can wander there, and other sessions use it too (a Chrome "T-008" window was on it). Video of one window would need ScreenCaptureKit; a screenshot per step works now.
  - Commit dc7b2cc updates the off-screen rules and the question. Side effect: TextEdit may restore two "Untitled" docs from my test next time it opens (autosave); harmless.
- 2026-10-05: User: "for iphones suggest using https://developer.apple.com/documentation/xcode/giving-external-agents-access-to-xcode". So the iPhone/iOS testing recipe in the teammate rules suggests Xcode's external-agent access (read that page for what it offers and how to enable it) for building, running and testing on iOS simulators/devices.
- 2026-10-05: Xcode external agents (23f78ec): Apple's page (read via its JSON API) says: Xcode > Settings > Intelligence > "Allow external agents to use Xcode tools", then `claude mcp add --transport stdio xcode -- xcrun mcpbridge`, project open in Xcode; Xcode alerts when an agent connects. The teammate rules now suggest it for iPhone/iOS apps, with these steps for the lead if the tools aren't there, and xcodebuild/simctl until then. Here: Xcode 27.0, mcpbridge present; not set up or tried (it acts on the project open in the user's Xcode, so I didn't connect it).
- 2026-10-05: Done, on main a51da80 (T-024): commits d0b1a96, 6a4be56, 0f667fc (rules), 59217b4 (wiring), bb206ea (README screenshot), rebased on fc9d553 (register.tsx conflict with the contribute rules: kept both) on task/T-022.
  - offScreen: a project key (PROJECT_KEYS, saved in config.json); asked by one askToTurnOn line after the git-flow question (header "Off-screen"); "Test off-screen" row after "Video quality".
  - Teammates always get testingRules (own env, new-bug line); the off-screen recipes only when on. The lead always gets coordinatorTestingRules (tell the user, file only when asked).
  - The question uses askToTurnOn's Enable/Not now, so OFFSCREEN_YES/NO and offScreenAnswer were dropped.
  - Checked: 249 tests pass (new core test: asked once per project, saved, rules in the spawn prompt and lead prompt); tsc -p . clean (copied .claude-plugin/types into the worktree, ignored by git).
  - How to check: a project without offScreen in config.json asks at session start; /better-tasks config shows the row; a spawned teammate's prompt has "## Testing like a user".
  - Not checked: Android -no-window, xvfb, Xcode MCP (not connected).
PR: https://github.com/iosifnicolae2/better-tasks/pull/6
- 2026-10-05: User: Mark as resolved. PR #6 conflicts with main (v0.8.0, fc9d553: T-024 contribute, new PR description order). pr-videos: update the branch from main, keep both, tests, push; lead then merges.
- 2026-10-05: Teammates test like a user in their own environment and report new bugs to the lead; "Test off-screen" setting asked once per project (hidden browser, windowless simulator, tmux, BetterDisplay virtual screen); iPhone apps via Xcode's agent tools.
