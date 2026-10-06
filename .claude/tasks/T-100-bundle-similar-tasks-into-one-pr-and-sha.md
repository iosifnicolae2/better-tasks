---
id: T-100
title: Bundle similar tasks into one PR and share one video between them
sprint: 2026-10-05
urgent: true
status: doing
owner: worktree-sandbox
rolled: 0
order: -6
created: 2026-10-07
---
## Goal
User's words: "also, you can bundle multiple tasks in one pull request if they are similar, and also share the same video between multiple tasks".

When a teammate owns several similar or related tasks (grouped per T-092 (#52)), it may open ONE PR for them and record ONE before/after video that covers them all. Each task links that PR and video. The lead then asks one approval question for the bundle, naming every task id with the shared PR number. Keep the approval rule "one question per PR".
1. Tooling: task_pr.py and the video tools accept several task ids for one PR or video: the PR title or body lists each, and each task file gets the same "PR:" and "Video:" notes. Closing or merging the bundle closes each task's PR state. The release notes and video handle a shared video without listing it twice.
2. Rules, short and principles only: teammate: similar tasks you own can share one PR and one video. Lead: one approval question per bundle, every task id in it; on yes, close every task in it.
3. Tests: a bundle of two tasks with one PR and one video; approval and closing; release notes with a shared video.

Waits on T-096 (#56) and T-099 (#57): same files (lead.md, teammate.md). worktree-sandbox takes it after them. User's repo: commit to main, with a review-only draft PR and a video. No release until the user approves. Tests: `sh scripts/test.sh`.

## Notes
- 2026-10-07: Queued for worktree-sandbox after T-096 and T-099: same files (lead.md, teammate.md).
- 2026-10-07: BEFORE: `task_pr.py open T-4 T-5` stops with "error: unrecognized arguments: T-5", no PR, nothing noted in either task file (scratchpad/t100/demo.sh, cap/before.txt). lead.md: "Ask the user about one task at a time: one question, never two tasks in it"; resolvedIn took one id per question; release_video.py looked only for <id>.mp4, and a PR subject "T-4 T-5 … (#7)" named T-4 alone.
