---
id: T-076
title: "Rule for unexpected bugs: small ones in the same task, bigger or other-area ones asked as a new task"
sprint: 2026-10-05
urgent: false
status: done
owner: lead-rules-2
rolled: 0
order: -3
created: 2026-10-06
---
## Goal
User's words: "also, when you find unexpected bugs, if they are small, do it in the same task, otherwise ask to do it in a new separate task if it's bigger or in different part of the application than the teammate who found it.."

Change the "New bugs" rule (today every bug a teammate finds becomes its own task) in the lead's rules, and in the teammate's rules if they say the same:
- A small bug in the teammate's own area: the teammate fixes it in the same task and mentions it in its notes, PR and done report.
- A bigger bug, or one in a different part of the app from the finding teammate's area: the teammate reports it and doesn't fix it. The lead asks the user whether to make it a new, separate task (one task per question, short; options like "New task" / "Skip"). Only on a yes does it become its own task, fixed the usual way, with a video and a PR.
Write it once, in the rules; make the teammate/done skills agree or link to it. Update the tests that check the rules text. Keep it short and lean, matching the rules' style.

This is the user's own repo (iosifnicolae2/better-tasks): work in it directly, with no fork, committing to main, with a review-only draft PR and a video. No release until the user approves.

## Notes
Video: [T-076.mp4](../tasks_videos/T-076.mp4)
- 2026-10-06: Changed the rules (`.claude/better-tasks/`): lead.md "New bugs" (small bug in the finder's area fixed in its task; bigger or other-area: lead asks the user "New bug: <what>. Make it a new task?", "New task" / "Skip"; on yes its own task with a video and a PR), teammate.md "Bugs you find" (fix a small one in your area, say so in notes and PR; else report), done.md (notes list a small bug fixed on the way). Tests in tests/rules.test.ts; regenerated tests/templates.gen.ts and docs/instructions.md; hooks/testenv.ts comment updated. Commit 46b8e49. `claude plugin test .`: 322 pass. Not checked: a live session where a teammate actually finds a bug.
- PR: https://github.com/iosifnicolae2/better-tasks/pull/42 (review only, draft). No release change.

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/42
T-076 Rule for unexpected bugs: small ones in the same task, bigger or other-area ones asked as a new task
A teammate now fixes a small bug in its own area inside its task. A bigger bug, or one elsewhere, comes to you as one question: "New task" or "Skip".
- 2026-10-06: Accepted. Full tests: 322 pass, templates current, the four check scripts ok, skills-check and yaml-check ok. Review PR #42 closed.
- 2026-10-06: New-bugs rule: a small bug in the teammate's own area is fixed within its task; a bigger or other-area bug is reported, and the lead asks the user "New task" / "Skip", one bug per question. 322 tests pass; review PR #42 closed. Not released yet.
