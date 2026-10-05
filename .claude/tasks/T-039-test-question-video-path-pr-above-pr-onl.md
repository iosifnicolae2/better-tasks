---
id: T-039
title: "Test question: video path + PR above, PR only in the question, one task at a time"
sprint: 2026-10-05
urgent: false
status: done
owner: test-question
rolled: 0
order: 0
created: 2026-10-05
---
## Goal
Change how the lead asks the user to test a finished task (lead rules in hooks/texts.ts, teammate's "For the user" block in skills/done/SKILL.md, plus anything related like skills/pull-request, skills/video).

User's words: "when creating the video, add also the path to the file in the message above the question and also the pr (as the claude code can open the video file.. and also the pr is clickable), in the question add only the pr; also always ask only for each task/pr after that continue with the next and display.. make sure this rule is followed, clean up the instructions to be easy to follow"

What done looks like:
- Text right above the question (the "Links:" lines): the local video file path (Claude Code opens it on click) AND the PR link (clickable). When there is no video, just the PR.
- The question itself: only the PR url, no video.
- One task/PR per question, always. After the user answers, act on it, then show the next task's links and ask about it. Make this rule hard to miss, so the lead always follows it.
- Clean up these instructions so they are short and easy to follow (keywords over paragraphs, say each thing once).
- Tests updated and passing.

This repo is better-tasks upstream itself, so no fork or linked install is needed.

## Notes
- 2026-10-05: Done (2026-10-05). No video: text-only change, nothing on screen.
PR: https://github.com/iosifnicolae2/better-tasks/pull/21
What changed:
- hooks/texts.ts Finishing: "**One task per question, always.**" first; then 3 steps per task: Links above (video path + PR), the question (only the PR url, never the video), act then next task.
- skills/done/SKILL.md: block's Links = `Video: [<abs path>](file://...)` + `PR: [#N](url)`; question carries only the PR url.
- hooks/pullrequest.ts, skills/video, skills/pull-request: one line each, same rule.
- Tests updated (core, tasks, pullrequest); `claude plugin test .`: 288 pass.
Commits: 52b6daa
Not verified: a live lead session following the new rules. No test covers the done skill's block (tests can't read skill files).

### For the user
Links:
PR: [#21](https://github.com/iosifnicolae2/better-tasks/pull/21)
Question:
T-039 Test question: video path and PR above, only the PR in the question
What changed: when a task is ready, the text above the question shows the video's file path (click to open it) and the PR link. The question itself shows only the PR. You are asked about one task at a time, then the next.
To test: read the new rules in the PR (hooks/texts.ts, skills/done/SKILL.md).
https://github.com/iosifnicolae2/better-tasks/pull/21
Is everything OK?
- 2026-10-05: Finishing rules: video path and PR link above the question, only the PR in the question, one task at a time (rule first, in bold).
- 2026-10-05: Follow-up (2026-10-05): scripts/skills-check.ts (run by release.sh) still looked for the old done-skill phrases. It now checks the new ones: the video path and the PR under Links, and the PR as the question's only link. Commit bc44f26 is pushed straight to main. skills-check passes; 288 tests pass. Release not run.
