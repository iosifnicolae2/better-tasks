---
id: T-104
title: Teammates create a virtual display when none exists
sprint: 2026-10-05
urgent: false
status: done
owner: testing
rolled: 0
order: -2
created: 2026-10-08
labels: [testing, virtual-display]
---
## Goal
User's words: "analyse the other sessions, why they did not created a virtual dsipaly.. make sure to add a short instruction if it doesn't exist a virtual display for the project/task (if there are concurent, to create it)".

1. Analyse other sessions' transcripts (teammates of other projects/tasks, under ~/.claude/projects/*) to find why teammates did not create a virtual display when testing off the user's screen. Find the concrete cause(s), with examples.
2. Add a short instruction (principle only, a line or two, per CLAUDE.md) where teammates read their testing rules: if no virtual display exists for the project/task, create one; when tasks run concurrently, each gets its own.
3. Fix any code or rule that caused the miss, if the analysis finds one.

This repo is better-tasks itself (the user maintains it): commit straight to main, run `sh scripts/test.sh`, and follow CLAUDE.md.

## Notes
Video: [T-104.mp4](../tasks_videos/T-104.mp4)
- 2026-10-08: User adds: "or the script to create it directly". Alternative or addition to the instruction: the testing script itself creates the virtual display when none exists for the project or task, one per concurrent task, so teammates don't have to remember to.
- 2026-10-08 (testing): Analysis of teammate transcripts 2026-10-05..08 (184 teammates; script scratchpad/t104/teammates.py). Causes:
  1. The rule reads as if the display already exists ("the project's own virtual display: record-display.sh gives you a turn on it"); nothing says it is made on demand. `record-display.sh status` says "<project> has no display now" with no hint either. best-remote-desktop T-032 (10-05) found "no virtual display exists on this Mac right now" and asked the lead "who is supposed to hold the kept-open one?" instead of making one.
  2. The testing skill is often never loaded: the Mac-app rule lives only there. DockPin T-014 (10-08, ~/Projects/DockPin, agent a74cfda) skipped it, then `open`ed DockPin.app and drove Xcode (activate, keystroke, click at) on the user's screens. Most teammates that touched screencapture/osascript had testing=-.
  3. Concurrent tasks in one project share one display and wait for a turn ("waiting: another recording ... has the display"), so a busy display pushes a teammate to wait or skip.
  Plan: rule line in testing.md + teammate prompt ("none yet? record-display.sh makes it; concurrent tasks each get their own"); record-display.sh gives a concurrent turn its own display instead of waiting; status says start/run makes one.
- 2026-10-08: The user asks: "why my screen is disconnecting?" Their real screen keeps disconnecting while T-104 is in progress. Stop anything that touches the user's displays (creating or removing virtual displays, display reconfiguration, screen_off) until the cause is known, and report it.
- 2026-10-08: User requirement: "make sure the virtual displays are not affecting the existing displays at all". Creating, using or removing a task's virtual display must not disconnect, blank, rearrange, resize or mirror the user's real displays. Verify this explicitly and show it in the video and PR.
- 2026-10-08: User requirement: "make sure to not have any dependencies for the virtual display". Creating the virtual display must not depend on any third-party app or install, such as BetterDisplay or Homebrew packages. Use only what ships with the OS, or code bundled in better-tasks itself.
- 2026-10-08 (testing): Done on main: 620473c (record-display.sh: concurrent turn -> project's next free display, up to 8, made on first use; status hint; fixed two bugs found on the way: run's exit trap killed a display it had just made (keeper pid overwrote the turn pid), and two displays made at once got the same serial so macOS refused one), c6269fd (testing.md rule + teammate step 1 loads the testing skill). 378 tests pass; record-display-check passes with a fixed --size. Without --size it fails before and after the change because DockPin.app flips the main screen when a virtual display appears (told the lead as a new bug).
- 2026-10-08: PR: https://github.com/iosifnicolae2/better-tasks/pull/63
- 2026-10-08 (testing): Not checked: a real teammate session in another project following the new rule (it reaches installs with the next release). Push note: the SSH agent had no keys, so task_pr ran over HTTPS with gh's login (env only, no config changed).
- 2026-10-08 20:17 (testing): Stopped. Nothing of mine is running and no virtual display exists now (`record-display.sh virtuals` lists none; it only reads). From 19:59 to 20:12 my checks made and removed about 25 virtual displays. That means the demo runs, record-display-check.sh five times (once on the old code), and the look probes. Each add or remove is a macOS display reconfiguration. A new serial also makes macOS lay the screens out again, and DockPin switched the main screen (LG -> built-in) on every add. That very likely caused the disconnects; it matches the time. No more displays on this Mac until a way provably leaves the real ones alone.
  - Conflict: the concurrent change (620473c) makes more displays, and so more reconfigurations, than one kept display. It goes against "must not affect existing displays" unless a display add proves harmless.
  - Dependencies: the display uses CoreGraphics' CGVirtualDisplay from Swift bundled in bin/. No BetterDisplay or any install. But record-display.sh compiles it with swiftc, which comes with Xcode's Command Line Tools, not the bare OS.
- 2026-10-08: User decisions:
(1) One virtual display per project, made once and never removed. Concurrent tasks share it. Revert the per-task display part of 620473c.
(2) Bundle a prebuilt display helper binary in better-tasks, so swiftc / Command Line Tools aren't needed.
(3) Verify with one watched test: a single display created while the user watches their screens, only after DockPin's fix (T-105) is done. Ask the lead before creating it.
Code changes can go ahead now. Until then, create no displays. Main isn't pushed yet; keep it that way until the user accepts.
- 2026-10-08 (testing): The user's decisions, done:
  - (1) 486056e: one display per project, made once, never removed by a recording. Concurrent tasks take turns. The per-task part of 620473c is reverted. A changed main-screen look no longer remakes it; --size applies only when it is made.
  - (2) 1518364: bin/record_display is bundled prebuilt (arm64 + x86_64, ad-hoc signed, macOS 12+), with bin/record_display.sha256 of its sources. record-display.sh runs it while the sources match, else compiles if swiftc is there. scripts/build-display-helper.sh rebuilds it. Read-only `screens` checked with the bundled binary.
  - 378 tests pass. No display was made.
  - Waiting for (3): T-105 done, then the lead's go for one watched add. The "after" video comes from that.
  - Follow-up for release.sh's owner: refuse a release when bin/record_display.sha256 doesn't match the sources.
- 2026-10-08 (testing): release.sh check added (lead's call): refuses a release when bin/record_display.sha256 doesn't match the Swift sources. Checked: current sources pass, an edited source is caught. Waiting for the lead's go on (3).
- 2026-10-08 20:42 (testing): Watched test (3), with the lead's go, the fixed DockPin running and the user watching:
  - In this repo, `record-display.sh start` made exactly one display, "better-tasks" (id 55), at 0,2197 below every screen.
  - The real screens were read before and 1, 3, 6 and 10 s after (scratchpad/t104/screens-*.txt). All the same: main stayed the Odyssey (5); the Odyssey, built-in and LG kept their origins and sizes.
  - Stopped the turn. A second turn (`run`) reused display 55, nothing new made, and the screens were still unchanged. The display is kept, as decided.
  - New video. PR #63 updated.

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/63
T-104 (#63) Teammates create a virtual display when none exists
Why teammates didn't make one: the rule read as if the display already existed, and many skipped the testing instructions. Now the script makes the project's one display when there is none and keeps it; tasks take turns on it. It needs nothing installed, and in a watched test your real screens didn't change.
- 2026-10-08 (testing): Finished: 378 tests pass; main pushed (551f1e5..cf8043c); PR #63 closed, task/T-104 and task/T-104-base deleted locally and on GitHub.
- 2026-10-08: record-display.sh now makes the project's single virtual display when none exists and keeps it; tasks take turns on it. The display helper ships prebuilt, so nothing needs installing. release.sh refuses to ship a stale helper. The testing rule and teammate step 1 (load better-tasks:testing first) are updated. The watched test showed the real screens unchanged. Review PR #63 is closed.
