---
id: T-094
title: "Batched testing: owners record \"before\", one tester records \"after\" for all, finds bugs, owners combine and finish"
sprint: 2026-10-05
urgent: true
status: doing
owner: tester-role
rolled: 0
order: -2
created: 2026-10-07
---
## Goal
User's words: "and each teammate can record their before video and let the batch-testing teammate record the after and also identify bugs and write them in the task and at the end notify the owner of the task and he will do what's needed, combine the video, finish the task, add a short instruction for the tester to be a tester and identify bugs, check if it's working as expected in one full go".

Builds on T-091 (#51), the batchDeviceTests setting. When tasks are batched on one build or device run:
1. Each owner teammate records its own "before" video (as today), makes its change, and hands over to a tester instead of recording "after".
2. One tester teammate runs the batched build once and, in one full go, tests every batched task as a user would. It records each task's "after", checks it works as expected, and writes any bugs it finds into that task's file: what, how to see it again, a capture. When the batch is done, it tells each owner.
3. The owner fixes its bugs (the tester re-checks if needed), combines its "before" with the tester's "after" into the before/after video (the existing demo-video/spec tooling), opens its PR and reports done as usual.
4. A short tester instruction, principles only per CLAUDE.md: you are a tester, not a fixer. Test everything in the batch in one go, like a user. Find bugs and note them in each task. Don't change code. Report to each owner. Make it a role the lead can spawn (a rules file or agent type, whichever fits the plugin's patterns), shown only when batchDeviceTests is on.
5. Short lead and teammate rule lines for the hand-off, gated by the same setting. Update the tests (rules text and gating).

This is the user's own repo: commit to main, with a review-only draft PR and a video (or no video if it's text-only; say so). No release until the user approves. Tests: `sh scripts/test.sh`.

## Notes
- 2026-10-07: User adds: "if the batch-tester is enabled, add also a short instruction for him to create his own optimized environment to save time and test efficiently". The tester instruction gets one short line, principles only: set up your own optimized test environment once (a prebuilt app, seeded test data and accounts, scripted steps to reach each screen, fast reset between cases, recording ready) and reuse it for the whole batch, to save time and test efficiently.
Video: [T-094.mp4](../tasks_videos/T-094.mp4)
- 2026-10-07: before: the rendered lead, teammate and video rules (no tester; each owner records its own after).
- 2026-10-07: done in 7bf285b. New skill `better-tasks:tester` (skills/tester/SKILL.md, template .claude/better-tasks/tester.md): a skill, like the other step how-tos, that the lead tells the "batch-testing" teammate to load; the lead names it only when batchDeviceTests is on. Gated lines: the lead's hand-off (Routing), the teammate's (owner captures before, writes what to check, fixes the tester's bugs, combines videos), the video skill's (the tester's AFTER goes into the owner's spec). Tests: rules.test (text and gating), skills.test, core.test (the skill loads). 352 pass.
- 2026-10-07: PR: https://github.com/iosifnicolae2/better-tasks/pull/54 (review-only draft). No release change. Not checked: a real batch run with a live tester teammate (text-only change; checked by rendering the texts and the skill load in tests).
- 2026-10-07: tester sets up its own optimized environment once, reused for the batch (edaf692); test added, 352 pass; new video; PR updated.

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/54
T-094 (#54) Batched testing: owners record "before", one tester records "after" for all, finds bugs, owners combine and finish
When tasks share one build, each owner records its "before"; one tester then tests them all in one go, first sets up its own fast test environment, then records each "after" and writes bugs into each task, and the owners fix them and finish. Shown only with Batch device tests on.
