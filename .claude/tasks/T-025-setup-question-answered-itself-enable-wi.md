---
id: T-025
title: Setup question answered itself ("Enable") without a keypress
sprint: 2026-10-05
urgent: false
status: done
owner: worktrees-2
rolled: 0
order: -6
created: 2026-10-05
---
## Goal
Bug flagged by teammate worktrees-2 while testing T-023; user said "File it".

What was seen: in a live Claude Code run in a scratch project, a setup question (asked through askToTurnOn in hooks/register.tsx at session start) got "Enable" chosen within a few seconds of appearing, with no key pressed. A second run waited for an answer as it should. Could be a stray keypress, or a real bug affecting every setup question (videos, git flow, off-screen, IntelliJ).

Goal: find out whether setup questions can be answered without the user (e.g. buffered input at session start, a default/timeout, two questions racing, a keypress meant for another prompt). Reproduce it or rule it out with evidence. If real, fix it so a setup question only takes the user's deliberate answer.

Done: cause in plain words (or why it's ruled out), the fix, and how the user can check it.

## Notes
Video: [T-025.mp4](../tasks_videos/T-025.mp4)
- 2026-10-05 (worktrees-2): Real bug, reproduced.
  - Cause: setup questions (videos, git flow, IntelliJ, off-screen) pop up on their own a second or two after Claude Code starts, in place of the prompt box, with option 1 "Enable (recommended)" highlighted. A user who is already typing a first prompt presses Enter into the question: Enter picks the highlighted option. Reproduced in tmux on main (44a834a): typed "fix the login bug" + Enter while the videos question showed: config.json got "demoVideos": true and the Kokoro voice download started; the typed prompt was lost.
  - The T-023 run that showed it: the question was answered 4.8 s after it appeared (transcript times 14:38:45.5 / 14:38:50.3), with no key sent by me. That run's Terminal window was brought to the front (osascript activate) while the user was typing in IntelliJ, so a keypress of the user's most likely landed in it. Same mechanism: a key meant for something else.
  - Fix (9399a6c, hooks/register.tsx askSetup): (1) each setup question waits until the prompt box has been empty for 2 s (polls $.prompt.read every 250 ms; gives up after 10 min, asked next session), so it never pops up over a prompt being typed; (2) "Decide later" is the first, highlighted option: a stray Enter picks it, nothing is saved, asked again next session. Turn-on questions: "Decide later" / "Enable (recommended)" / "No" ("Not now" became "No", which saves false). Free text typed into the question no longer saves "off". The git flow question gets "Decide later" first too.
  - Checked live (tmux, Claude Code 2.1.289): a draft typed during startup stays and no question shows; after clearing the box the question shows 2 s later with "Decide later" first; typing a prompt + Enter into it saved nothing (config.json stayed {}).
  - How the user can check: start Claude Code in a project without "demoVideos" in .claude/tasks/config.json and start typing right away: no question covers the prompt box. Clear it: the question appears with "Decide later" highlighted; Enter there saves nothing.
  - Tests: 260 pass (2 new: waits while typing; "Decide later" first saves nothing), tsc clean.
  - Trade-off for the user to judge: the recommended option is now second, not first.
  - PR: https://github.com/iosifnicolae2/better-tasks/pull/9 (branch task/T-025, commit 9399a6c, on main 0cec5ab)
- 2026-10-05: Setup questions wait until the prompt box is empty for 2 s and put "Decide later" first, so a stray Enter saves nothing.
