---
id: T-097
title: Keep the videos branch under jsDelivr's 50 MB limit
sprint: 2026-10-05
urgent: false
status: done
owner: pr-videos-2
rolled: 0
order: -5
created: 2026-10-07
---
## Goal
Bug found by tester-role during T-094 (#54); the user chose "New task".

The public videos branch (better-tasks-videos, used by video-branch.sh / task_pr.py / release.sh through cdn.jsdelivr.net/gh/<repo>@<sha>/...) has a 45.8 MB tree. jsDelivr refuses GitHub packages over 50 MB, so new video links may stop loading soon. A video is about 1–2 MB.

Fix it so the branch stays under the limit for good, without breaking links that existing PRs and releases use. Check how jsDelivr counts size: the whole tree at the pinned commit or just the file. The likely fix is that each commit on the videos branch carries only the new video and poster, or a tree that's pruned to recent ones; old links keep working because they pin old commits. Use current jsDelivr docs. Show it: the tree size at the newest videos commit before and after, and an old PR's video and a new one both loading signed out (curl).

Bug fix: work in your own worktree, with a PR into main that merges after the user approves, and a short video or capture. Tests: `sh scripts/test.sh` and scripts/video-branch-check.sh. Waits on nothing; worktree-sandbox (T-096) is editing the spawn and settings code, not the video scripts.

## Notes
- 2026-10-07: pr-videos: branch t-097-videos-branch-size (from main 49a788b). BEFORE: scratchpad t097/before.txt (tip 427b8944: 42 files, 43.7 MB; T-011 and T-073 links 200). jsDelivr: data.jsdelivr.com README "packages larger than 50 MB for GitHub" unsupported; jsdelivr README 150 MB / 20 MB per file. The data API lists the whole tree at the pinned commit, so the tree counts. Plan: each videos commit keeps the new files plus the newest older commits' files that fit a 30 MB budget; old links pin ancestor commits, never rewritten. release_video.py reads videos from the branch tip, so recent ones stay there.
- 2026-10-07: Video: [T-097.mp4](../tasks_videos/T-097.mp4)
pr-videos: done. PR: https://github.com/iosifnicolae2/better-tasks/pull/55 (draft into main, branch task/T-097, commit 73b72eb). bin/video-branch.sh: each new videos commit holds the new files plus the newest older commits' files that fit 30 MB (BETTER_TASKS_VIDEO_BRANCH_BUDGET); nothing is rewritten. scripts/video-branch-check.sh: local-remote test of the trim and of the untouched older commit (also fixed its script path to be absolute). Real push of this task's video: tip a768f6a2, 22 files, 27.2 MB (was 427b8944, 42 files, 43.7 MB). Signed-out curl 200 video/mp4: T-011 (PR #1, e42c5cb7), T-073 (PR #40, 3ab8bc2f), T-097 (a768f6a2). Tests: video-branch-check ok, test.sh 352 pass. Not checked: a full release run; release_video.py reads task videos from the branch tip, recent ones (about 15) stay there, so a release finds its own tasks' videos; a task older than that falls out (could be made to look through history, release area). No draft release: release.sh's flow and notes are unchanged.

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/55
T-097 (#55) Keep the videos branch under jsDelivr's 50 MB limit
Each new video on the videos branch now keeps only the newest videos beside it (about 30 MB), so new links keep loading; old PR and release links still play, since their commits are untouched.
- 2026-10-07: pr-videos: finished. Full tests on the branch rebased onto origin/main 358a5c3: test.sh 347 pass, video-branch-check, task-pr-check, open-pr-check ok, skills-check and settings-doc current. PR #55 made ready and squash-merged into main: 2f13fc99. Before the rebase the branch was based on local main 49a788b, whose 22 T-091..T-094 commits are not on origin yet; the rebase kept them out of this squash.
- 2026-10-07: bin/video-branch.sh: each new videos-branch commit holds the new files plus the newest older ones that fit in 30 MB (BETTER_TASKS_VIDEO_BRANCH_BUDGET). The newest tree went from 43.7 MB to 27.2 MB; old pinned links keep working. video-branch-check covers it; 352 tests pass. PR #55 squash-merged as 2f13fc9. Local main must pull it before pushing T-091..T-094.
