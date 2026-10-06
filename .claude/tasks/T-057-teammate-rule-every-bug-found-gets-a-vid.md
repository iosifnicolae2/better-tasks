---
id: T-057
title: "Teammate rule: every bug found gets a video and a PR, merged to main or the task branch"
sprint: 2026-10-05
urgent: false
status: done
owner: bug-flow
rolled: 0
order: -6
created: 2026-10-06
---
## Goal
User's words: "for any identified bug, make sure to record a video and let the user see it in a pr and merge it either to main or to the current task branch.. (add this to the instructions)"

This changes better-tasks' own instructions, both the lead rules and the teammate rules and skills. Today, a teammate that finds a bug says "New bug: ...", and the lead asks the user whether to file it. The user wants every identified bug fixed this way:
- record a video of it (before/after);
- show it to the user in a PR;
- merge the PR into main, or into the current task's branch when the bug belongs to that task.

Find every place the current "New bug" flow and the video/PR rules are written (hooks with lead/teammate rules, the done, testing, video and pull-request skills, the settings docs). Change them once, consistently, and keep the "say a thing once, link elsewhere" rule.

Done: the instructions say this, the tests pass, and a sample flow reads clearly for both lead and teammate.

## Notes
Video: [T-057.mp4](../tasks_videos/T-057.mp4)
- 2026-10-06: Done (commit 49475bc). What changed:
  - Teammate rule (hooks/testenv.ts testingPointer): a bug your own change made is part of your task, fix it there. Any other bug: don't fix it unasked; capture it first (its BEFORE), then "New bug: <what>, <how to see it again>, BEFORE: <path>".
  - Lead rule (coordinatorTestingRules, now per git flow): every bug gets fixed with a before/after video and a PR the user sees before it merges. The lead files it (task_create) right away, tells the user in one line, hands it out. It no longer asks whether to file it (the user's standing ask).
  - Where the fix merges: came from a task whose PR is still open → that task's owner fixes it on that task's branch (dev-prs: land on dev, task_pr.py open again; worktree-prs: push to its branch), shown in its PR and a new video. Else its own task and PR into main.
  - Straight to main (this project): the lead spawns the bug's teammate with isolation "worktree"; that teammate gets the PR rules (gitflow.ts teammateRules), the pull-request skill says to follow "Worktree and PR per task", and the lead gets the PR merge lines under "Git flow: straight to main" (directLeadRules). PR description rules now apply in every flow (register.tsx prBodyNow).
  - Docs: done and pull-request skills, settings skill + scripts/settingsdocs.ts, settings page's git flow line, FLOW_ABOUT.
  - Sample flow (direct): teammate sees a bug in /away → captures BEFORE → "New bug: ..., BEFORE: <path>" → lead files T-0xx, tells the user, spawns a teammate with isolation worktree → it fixes, video, PR into main → user's yes → lead merges.
  - Checks: claude plugin test . 324 pass; tsc clean; settings-doc --check current. Not verified: a live bug flow end to end. Videos stay tied to the videos setting (on here).
  - Local build: none to open; a plugin, the rules load at the next session start.

### For the user
Question:
T-057 Every bug found gets a video and a PR
What changed: when a teammate finds a bug, it captures it right away and tells me. I file it and a teammate fixes it with a before/after video and a PR you see before it merges. The PR goes into main, or into the task's branch when the bug came from a task still under way. In this project (straight to main) a bug fix is the one thing that gets its own PR.
To try it: start a new session; the rules load then.
Is everything OK?

- 2026-10-06: Finished: full tests pass (324). Video made from the old and new rule texts (nothing on screen). Straight to main: no PR; commit 49475bc is final.
- 2026-10-06: Every bug a teammate finds is filed at once and fixed with a before/after video and a PR, into main or the open task's branch it came from
