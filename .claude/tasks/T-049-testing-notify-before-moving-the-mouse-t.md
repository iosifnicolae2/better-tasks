---
id: T-049
title: "Testing: notify before moving the mouse to the test screen, move it back after"
sprint: 2026-10-05
urgent: false
status: done
owner: mouse-notice
rolled: 0
order: -5
created: 2026-10-06
---
## Goal
User's words: "add an instruction that when moving the mouse to a test screen, to display a notification and then move the mouse back when you're done".

In the teammate's testing instructions (skills/testing, and the teammate prompt part about the test screen if any):
- Before a teammate moves the user's mouse pointer onto a test screen (e.g. to click in an app on the virtual display), show a short macOS notification first, e.g. "better-tasks: a teammate is using the mouse for a moment". Give the exact command (osascript display notification, or what the plugin already uses).
- Save the pointer position first, and move it back there as soon as it's done.
- Keep it short: keywords and one example command. Update skills-check if a phrase should guard it. Tests and skills-check pass.
- Flow: quick checks first, then report done.

## Notes
- 2026-10-06: User added: "but try not to use the mouse unless necessary.. you can setup other ways to test and take recordings..". So the testing instructions should come in this order:
1. Test and record without the user's mouse. Use the app's own test hooks, accessibility actions (AXPress via osascript/System Events on the element), keyboard events sent to the app, URL schemes, CLI flags, headless browsers or Playwright, and screen capture of the test display.
2. Only when none of these can do it, use the mouse, with the notification and move-back rule.
State this order first and briefly in the skill.
- 2026-10-06: Done by mouse-notice: skills/testing/SKILL.md, Off-screen > Mac apps, new "Mouse last" bullet: mouse-free ways first; only then notification (osascript display notification), save pointer (JXA CGEventGetLocation, tried: works), restore (CGWarpMouseCursorPosition). skills-check guards "Notify first, save the pointer, move it back"; passes. Local bun tests fail only on missing module 'claude-code/testing' (same before). No video: text only. PR: https://github.com/iosifnicolae2/better-tasks/pull/29. For the user: "Teammates now avoid your mouse; if one must click on the test screen, you get a notification first and the pointer goes back where it was. OK to merge PR #29?"
- 2026-10-06: ### For the user
Links:
[PR #29](https://github.com/iosifnicolae2/better-tasks/pull/29)
Question:
T-049 Testing: notify before moving the mouse to the test screen, move it back after
What changed: teammates now test without your mouse first. Only if a click on the test screen is really needed, you get a notification first, and the pointer goes back where it was right after.
To test: open the PR and read the "Mac apps" part of the testing skill.
https://github.com/iosifnicolae2/better-tasks/pull/29
Is everything OK?
- 2026-10-06: Testing skill: mouse-free testing first; mouse only as last resort, with a notification first and the pointer moved back after. 308 tests pass.
