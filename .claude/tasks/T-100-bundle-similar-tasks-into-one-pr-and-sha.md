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
Video: [T-100.mp4](../tasks_videos/T-100.mp4)
- 2026-10-07: Queued for worktree-sandbox after T-096 and T-099: same files (lead.md, teammate.md).
- 2026-10-07: BEFORE: `task_pr.py open T-4 T-5` stops with "error: unrecognized arguments: T-5", no PR, nothing noted in either task file (scratchpad/t100/demo.sh, cap/before.txt). lead.md: "Ask the user about one task at a time: one question, never two tasks in it"; resolvedIn took one id per question; release_video.py looked only for <id>.mp4, and a PR subject "T-4 T-5 … (#7)" named T-4 alone.
- 2026-10-07: Commits b2f8c7c and the next one. task_pr.py: `open <id> <id> [--title <words>]` opens one PR (task/<first>) for the commits naming any of the ids, with the first one's video. The title names every id and the description lists each task ("Tasks in this PR, one video for them all:"; the review note says "closes with its tasks"). open notes "- <date>: PR: <url> (with <others>)" in each task file, plus the shared "Video:" line when a file has none, once only. `close <id> <id>` closes it. release_video.py: a task's video is the one its "Video:" note names; a PR subject "T-4 T-5 Title (#7)" names both; tasks sharing a video get one card ("T-4, T-5 (#7)", titles joined) and the video once; the opening card lists every task. release.sh notes needed nothing: each id already gets the shared PR number. Lead: one question per PR; a shared PR's question starts with every id; on yes each of its tasks closes. resolvedIn now reads every id on the question's first line before its colon. One line each in teammate.md, pull-request.md ("open notes PR: <url> in each task file", in place of "Notes: PR: <url>") and video.md.
- 2026-10-07: Checks: `sh scripts/test.sh` 359 pass (new: the bundle's rule text and resolvedIn); `sh scripts/task-pr-check.sh` ok (new: a two-task PR, its title, description, one video, both task files' notes, noted once, close); new `sh scripts/release-video-check.sh` ok (tasks named by a bundle's PR, the shared video found, one card); skills-check ok; tsc clean. AFTER, as a user: scratchpad/t100/demo.sh (scratch repo, stand-in gh) opens one PR for T-4 and T-5 with both notes; scratchpad/t100/release-demo.sh made a real release video both before (the opening card listed T-4 and T-6, with T-5 missing) and after (T-4, T-5, T-6 listed; card "1 of 2 T-4, T-5 (#7)", the shared video once, 126 s). Video 57 s, spec scratchpad/t100/spec.json.
- Not checked: a real GitHub PR for a bundle (stand-in gh only); a live lead asking about a bundle.
- 2026-10-07: PR: https://github.com/iosifnicolae2/better-tasks/pull/58 (draft, review only; commits 51cb74d, 4a186f4). Its attached video gave 404 signed out (as #56's did), so it links the videos-branch copies (jsDelivr, both 200 with no cookies). Reported to the lead as a separate bug.

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/58
T-100 (#58) Bundle similar tasks into one PR and share one video
A teammate with several similar tasks can now open one PR and record one video for all of them. Each task links that PR and that video. You get one question for the PR, naming every task, and your yes closes all of them. The release video shows the shared video once, on one card naming those tasks.
