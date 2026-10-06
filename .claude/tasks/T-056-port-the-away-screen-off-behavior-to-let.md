---
id: T-056
title: Port the /away screen-off behavior to let-claude-work-while-you-sleep, commit and release
sprint: 2026-10-05
urgent: false
status: done
owner: away
rolled: 0
order: -5
created: 2026-10-06
---
## Goal
User's words: "it's working the away command make sure to integrate the same behaviour also in https://github.com/iosifnicolae2/let-claude-work-while-you-sleep and commit and release it.."

Source: T-055's accepted /away behavior in better-tasks (commit d590719; see .claude/tasks/T-055-*.md):
- The external physical displays (LG, Philips) are disconnected through macOS display configuration, so they go into no-signal standby.
- The built-in screen stays connected, black and at brightness 0, and takes the Dock and windows.
- Virtual displays stay on.
- The first real mouse or key input brings everything back, and every exit path re-enables the displays.

Done:
- The same behavior is in let-claude-work-while-you-sleep, matching its own code and conventions.
- It's committed and released there, using that repo's own release process.
- It's tested on the user's real screens. Ask the lead before any live run, because it blanks the user's screens.

## Notes
- 2026-10-06: Queued for away after T-055 finishes
- 2026-10-06: Ported in ~/Documents/Projects/let-claude-work (remote let-claude-work-while-you-sleep), commit f4d97c4 on master, not pushed. New Displays.swift: which screens are physical (IOKit, the same rule as better-tasks), turning a display off and on (SLSConfigureDisplayEnabled), and AppKit frames from CoreGraphics. Blackout.swift: the external screens go off; the built-in (else the main one) stays black at brightness 0, and its window follows the layout. Virtual displays are no longer covered. Only hardware input wakes it (it was the combined session state, which counts events other apps post). Every way out turns the screens back on: Stop, Quit (applicationWillTerminate), SIGTERM/INT/HUP, and at the next launch from the ids saved in UserDefaults if a run died. README gains a "Really off" line. Checked off-screen: physical() = 2,1,5 (virtual 7 and 37 excluded); frames match NSScreen; off and on of display 37; recovery at the next launch turns 37 back on. Live run needs the lead's go: scratchpad lcw-test/live.sh. Release after that: ./release.sh 1.4.0 (GitHub release, notarized when signed, brew tap bump).
- 2026-10-06: User approved the live run and the version: release as 1.4.0 after a good run.
- 2026-10-06: User after the second live run (launcher run of the new build's screen-off code): "yes, it was working". Accepted: push and release as 1.4.0.
- 2026-10-06: Live run 1 (11:01:52) showed nothing: the user was only watching and pressed nothing, and the blackout never started. osascript has no Accessibility access, so it can't click the menu. Live run 2 (11:04:15; scratchpad lcw-test/live2.log*) used a small launcher that calls the app's own Blackout.show() (Blackout.swift and Displays.swift as committed) and ends on the first real input. The LG and Philips went off by 1.6 s, and the built-in was at brightness 0 by 2.6 s. The virtual displays stayed on. The user's input came at 34.4 s; by 35.0 s all screens were back and the built-in at 0.98. It ended because the user was back. Windows: the same positions before and after (only their stacking order changed). The guard had nothing to do. Release waits for the user's word on what they saw.
- 2026-10-06: Finished: f4d97c4 pushed to let-claude-work-while-you-sleep master; released v1.4.0 with ./release.sh: https://github.com/iosifnicolae2/let-claude-work-while-you-sleep/releases/tag/v1.4.0 . The brew tap's cask now says 1.4.0, and its sha256 matches the zip. Not notarized: this Mac has no Developer ID certificate, so release.sh published it unsigned, which brew handles. Also, Apple's notary service answers 403, "a required agreement is missing or has expired". The user's running app is still 1.3.0: `brew upgrade --cask let-claude-work` gets 1.4.0. No video: the change is monitors going dark, which a screen capture can't show.
- 2026-10-06: Let Claude Work 1.4.0 has the new /away screen-off (externals off, built-in black at 0, virtual displays on, real input wakes); released, brew tap updated, unsigned (no notarization)
