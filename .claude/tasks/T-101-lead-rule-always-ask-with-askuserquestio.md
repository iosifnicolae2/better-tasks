---
id: T-101
title: "Lead rule: always ask with AskUserQuestion, one task at a time, PR link before and in the question"
sprint: 2026-10-05
urgent: false
status: done
owner: lead-rules
rolled: 0
order: -2
created: 2026-10-07
labels: [lead-rules]
---
## Goal
User's words (2026-10-07): "check the instructions, make sure to use asktool always to ask user questions, one task at a time, you can ask only multiple questions only for a single task, by displaying the pr link before and in the question, add this as a short rule".

Context: the lead had just asked for a Gemini key with AskUserQuestion, but other questions went out as plain text, and the existing rule in .claude/better-tasks/lead.md ("How a task goes", step 4) says "one question, never two PRs in it or two questions at once".

Change the lead's rules (.claude/better-tasks/lead.md, and anywhere else the same rule is stated: status-check, skills, templates; say it once, link elsewhere) to one short rule:
- Every question to the user goes through AskUserQuestion, never plain text.
- One task per ask. Several questions in one ask are fine only when they're all about that one task.
- The task's PR link goes in the text just before the ask and again inside the question (when it has a PR).
Replace the "never two questions at once" wording, which this supersedes. Keep it to a line or two, per the project's CLAUDE.md (principles only).

This repo is upstream (iosifnicolae2/better-tasks, the user's own), so no fork. Commit to main, a review-only draft PR. No video needed if nothing visible changes; say so. No release until the user approves.

## Notes
- 2026-10-07: rule only stated in lead.md. Added one general rule (AskUserQuestion only, one task per ask, PR link above and inside); step 4 now points to it, old "two questions at once" wording gone. Tests updated; 359 pass. No video: prompt text only. Commit 27aa735. PR: https://github.com/iosifnicolae2/better-tasks/pull/59
- 2026-10-07: accepted; full tests pass; review PR closed.
- 2026-10-07: Accepted by the user. New lead rule: every question via AskUserQuestion, one task per ask (several questions only for that task), PR link above and inside the question; step 4's "two questions at once" wording removed. 359 tests pass; review PR #59 closed.
