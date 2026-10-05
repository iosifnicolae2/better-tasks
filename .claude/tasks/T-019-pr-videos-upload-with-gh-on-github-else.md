---
id: T-019
title: "PR videos: upload with gh on GitHub, else a separate branch linked in the PR"
sprint: 2026-10-05
urgent: false
status: done
owner: pr-videos
rolled: 0
order: -1
created: 2026-10-05
---
## Goal
User's words: "also, if there is a github project, suggest using gh to upload the videos, otherwise do it in the git repo in a separate branch and link it in the pr.."

Context: with "PR per task" on, a finished task's before/after video (.claude/tasks_videos/<task id>.mp4) shows in the PR as a poster picture that links to the mp4. This is about where the video file is hosted.

Goal:
- Project is on GitHub: the teammate rules suggest uploading the video with the gh CLI (check what gh actually supports for hosting a file; e.g. a release asset or similar), and the PR links to that.
- Not on GitHub (or gh not usable): commit the video to a separate branch in the repo (not the task's branch, not main) and link it from the PR.
- Videos must not end up in main's history.

Done: the rules/scripts do this; explain in plain words what changed and how the user can check it on a real PR.

## Notes
- 2026-10-05: No video: a rules/script change, nothing on screen.
- 2026-10-05: What changed (commit 80f49cb):
  - GitHub with gh 2.99+: unchanged; `gh pr create --attach` uploads poster + video (GitHub's own hosting; gh has no other upload command).
  - gh can't attach (old gh, upload failed): new `bin/video-branch.sh <video> <poster>` commits both to branch `better-tasks-videos` (orphan: own history, never merged; no checkout touched, private index), pushes, prints links pinned to that commit + the fitting caption. Public GitHub repo: jsDelivr links (served as video/mp4, plays with sound). Private: github.com/.../raw links (GitHub serves mp4 as a download, no player). Other hosts: GitLab-style /-/raw/ link.
  - No GitHub remote: still no PR; the video goes on the branch if there is a remote, link in the notes.
  - Rules: hooks/pullrequest.ts (PR teammate rules), hooks/demovideo.ts (the script line); gh-update failure toast now says "their video goes on a branch".
- 2026-10-05: Checked: throwaway local remote (orphan branch, 2nd run keeps 1st files, main and work tree untouched); real repo: pushed sample T-011 to better-tasks-videos (e42c5cb), `git merge-base origin/main origin/better-tasks-videos` finds nothing; jsDelivr returns 200 video/mp4. Tests: 213 pass.
- Not verified: private-repo raw link in a real PR; GitLab link.
- How to check on a real PR: in a project with old gh (or skip --attach), run `bin/video-branch.sh .claude/tasks_videos/T-xxx.mp4 .claude/tasks_videos/T-xxx.png`, paste the picture line with the printed links + the printed caption into the PR body; click the picture: the video plays (public repo). `git log main` never shows the video.
- 2026-10-05: Automated security review flagged bin/video-branch.sh (MEDIUM): the web url is built from `git remote get-url`, so a remote like https://user:token@host/... would print the token into the video links (and so into the PR). Fix: strip userinfo (e.g. sed `s#^(https?://)[^@/]+@#\1#`), and refuse to print links if the result still has '@'. Add a test.
- 2026-10-05: Security fix (ea2f07d): web_url strips user/token from the remote url, refuses if '@' remains, runs before any push. Check: `sh scripts/video-branch-check.sh` (plugin test runner can't spawn a shell, so it's a script). Commits: 80f49cb, ea2f07d on task/T-019.
PR: https://github.com/iosifnicolae2/better-tasks/pull/1
- 2026-10-05: PR videos: gh --attach stays first; when gh can't attach, bin/video-branch.sh puts video + poster on the never-merged better-tasks-videos branch and prints links (tokens stripped from the remote url).
