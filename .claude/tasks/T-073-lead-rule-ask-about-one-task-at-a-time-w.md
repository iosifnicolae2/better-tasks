---
id: T-073
title: "Lead rule: ask about one task at a time, with its video and its PR link above and inside the question"
sprint: 2026-10-05
urgent: true
status: doing
owner: lead-rules
rolled: 0
order: -4
created: 2026-10-06
---
## Goal
User's words: "make sure to add a principle to ask me one task at a time, with video recorded and a link to the pr (above the question and also inside the question)".

Change the lead's rules (the coordinator text better-tasks injects; today step 4 of "How a task goes" says to ask about each finished task in one short question, its PR linked just before):
- Ask the user about one task at a time. Never several tasks in one question, and never several questions about different tasks at once.
- Ask only once the task's before/after video is recorded and in its PR.
- Put the PR link both in the text right above the question and inside the question text itself (the AskUserQuestion question string), so it's visible either way. Include the release link too, when there is one.
Say the rule once in the lead rules. Where other docs (the done or pull-request skills, README) describe the approval question, make them agree or link to it. Add or adjust tests that check the rules text, if any exist.

This is the user's own repo (iosifnicolae2/better-tasks): work in it directly, with no fork, committing to main, with a review-only draft PR with a video. No release until the user approves.

## Notes
- 2026-10-06: User adds: "also the question should present what has been implemented/fixed, keep it short and lean". The approval question itself must say briefly what was implemented or fixed (not only the link and "Is everything OK?"), and stay short and lean.
Video: [T-073.mp4](../tasks_videos/T-073.mp4)
PR: https://github.com/iosifnicolae2/better-tasks/pull/40
- 2026-10-06: step 4 of the lead rules (`.claude/better-tasks/lead.md`) now says: one task at a time, once its video is in its PR, never two tasks in a question or two questions at once; the PR link (and release's) in the text above and inside the question. Regenerated docs/instructions.md and tests/templates.gen.ts; tests/rules.test.ts and tests/core.test.tsx check it. 322 tests pass. done.md, pull-request.md and README already agree, left as they are. Commit abfe06c.
- 2026-10-06: the user's note: the question now says in a few words what was implemented or fixed ("<id>: <what it implemented or fixed, in a few words>. PR: <url>. Is everything OK?"), short and lean. New video. 322 tests pass. Commit ceb2b4a.
- Not checked: a live lead session following the new rule.

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/40
T-073 Lead rule: ask about one task at a time, with its video and its PR link above and inside the question
The lead now asks about one finished task at a time, only once its video is in its PR. The question says briefly what was implemented or fixed, with the PR link both above it and inside it.
