---
id: T-010
title: Accept question: plain options, no preview
sprint: 2026-09-28
urgent: false
status: done
owner: accept-question
rolled: 0
order: 0
created: 2026-10-04
---
## Goal
The lead's accept question uses the normal AskUserQuestion look: two options, Accept and Request changes, plus the built-in free-form "Other" Claude adds. No preview field (it switches to the side-by-side layout the user dislikes). Check lines move into the Accept description.

## Notes
- 2026-10-04: Finishing rules in hooks/texts.ts: options Accept (check lines in its description) and Request changes, no preview, no third option (built-in Other is the free-form reply; noted on the task and acted on). "Done/Skip" rule no longer mentions preview. Nothing else in README/docs/tests/screenshots described the preview. validate + tsc + 166 tests pass. Commit a3353ad.
- 2026-10-04: Accept question is plain: Accept (with check lines in its description) and Request changes, plus the built-in Other; no preview. Released as v0.4.0.
