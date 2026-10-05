---
name: pull-request
user-invocable: false
description: How a better-tasks teammate opens and updates the pull request of its task (push, gh pr create or task_pr.py, the description from the template, the video in it, request changes, conflicts). Load it when your task is done and your prompt says the project has a PR per task, and when the lead asks you to update your PR.
---

# Pull request per task
"Settings" above says this project's git flow and how to write the description. Never merge it yourself: the lead merges once the user approves.

## The description
Write it to `<scratchpad>/pr.md`, as "The PR's description" in "Settings" above says. The user reads it on GitHub, often on a phone.
With a before/after video (the `better-tasks:video` skill), its poster (demo-video.sh made it next to the video, same name, .png) shows as a picture that opens the video, the browser playing it with sound. Two lines, right after the request and why, the text line right under the picture (alone, GitHub turns the link into its muted player; GitHub drops target="_blank", so the line tells how to get a new tab):
```
[![Before/after video: click to play it with sound](<poster's absolute path>)](<video's absolute path>)
Click the picture to play the video with sound (Cmd-click or Ctrl-click: in a new tab).
```

## Worktree and PR per task: when "Settings" says so
You work in your own git worktree, on its own branch; the project's main checkout stays as it is.
- The project has no GitHub remote (`git remote -v`)? No PR: say so in your notes. A video goes on the videos branch (below) if the project has a remote; your notes get its link.
- Push to a short branch named for the task, `git push -u origin HEAD:task/T-004`, then open the PR against the branch the project's main checkout is on (usually main):
  `gh pr create --base main --head task/T-004 --title "T-004 <task title>" --body-file <scratchpad>/pr.md`
  With a video: the two lines in pr.md, and `--attach <poster's absolute path> --attach <video's absolute path>`: gh uploads both and points the picture and its link at them.
- gh can't attach (older than 2.99, or the upload failed)? Put the video on the videos branch: `${CLAUDE_PLUGIN_ROOT}/bin/video-branch.sh <video> <poster>` prints their web links (video first), then the caption. Use them in the two lines, with no --attach: its links in the picture line, its last line as the text line.
- Watch its checks: Bash with run_in_background, `gh pr checks <n> --watch --fail-fast >/dev/null; gh pr checks <n>`: one notice when they end. Plain commands only: no `( … )`, `{ …; }`, function, `bash -c` or heredoc around gh or git, or Claude Code refuses it ("too complex to verify"; your prompt's "gh and git in your worktree").
- Request changes: commit and push to the same branch; the PR follows. A new video: the same two lines and `gh pr edit <url> --body-file <scratchpad>/pr.md --attach <poster> --attach <video>`.
- The lead says the merge conflicts: merge main into your branch (`git fetch origin && git merge origin/main`), fix, test, push; tell the lead.

## Shared dev branch: when "Settings" says so
One checkout, on the dev branch "Settings" names, shared with the other teammates; your commits land there with land.sh (your prompt says how).
- Leave the two video lines out of pr.md, then `python3 ${CLAUDE_PLUGIN_ROOT}/bin/task_pr.py open T-004 --body-file <scratchpad>/pr.md`. It puts the task's commits on `task/T-004` (origin's main plus them, picked without touching any checkout), pushes it and opens the PR with the video right after the request and why (attached, or on the videos branch when gh can't). Run again later: it adds only the new commits.
- It stops on a commit that conflicts on main (it leans on another task's commit): tell the lead which one.
- Request changes, or the merge conflicts: land the fix on the dev branch, then run open again. Never fix on the task branch.

## Then
Your notes get the line "PR: <the url it printed>", and the PR link goes in your "For the user" block, under "Links:" and in the question (the `better-tasks:done` skill).
