---
name: pull-request
user-invocable: false
description: How a better-tasks teammate opens and updates the pull request of its task (push, gh pr create or task_pr.py, the description from the template, the video in it, conflicts). Load it at done, before the user is asked, when your prompt says the project has a PR per task, and when the lead asks you to update your PR.
---

# Pull request per task
The PR opens at done, with its video, before the user is asked (the `better-tasks:done` skill). "Settings" above: the git flow and the description. Never merge it yourself: the lead merges once the user marks it resolved.

## The description
`<scratchpad>/pr.md`, as "Settings" above says; the user reads it on GitHub, often on a phone.
A video: its poster (next to it, same name, .png) as a picture that opens it with sound. These two lines, right after the request and why (a bare link would become GitHub's muted player):
```
[![Before/after video: click to play it with sound](<poster's absolute path>)](<video's absolute path>)
Click the picture to play the video with sound (Cmd-click or Ctrl-click: in a new tab).
```

## Worktree and PR per task: when "Settings" says so
Commands: plain ones, as your prompt's "gh and git in your worktree" says (a title with a quote mark and the word git, or starting with "git", is refused: reword it).
- No GitHub remote (`git remote -v`)? No PR: say so in your notes.
- `git push -u origin HEAD:task/T-004`, then, against the main checkout's branch (usually main):
  `gh pr create --base main --head task/T-004 --title "T-004 <task title>" --body-file <scratchpad>/pr.md`
  With a video: the two lines in pr.md, and `--attach <poster's absolute path> --attach <video's absolute path>`.
- gh can't attach (older than 2.99, or the upload failed)? Put the video on the videos branch: `${CLAUDE_PLUGIN_ROOT}/bin/video-branch.sh <video> <poster>`; its links go in the two lines, no --attach.
- Watch its checks: Bash with run_in_background, `gh pr checks <n> --watch --fail-fast >/dev/null; gh pr checks <n>`.
- A change once the PR is open: push to the same branch. A new video: `gh pr edit <url> --body-file <scratchpad>/pr.md --attach <poster> --attach <video>`.
- The merge conflicts: `git fetch origin && git merge origin/main`, fix, test, push; tell the lead.

## Shared dev branch: when "Settings" says so
Your commits land on the dev branch with land.sh (your prompt says how).
- pr.md without the two video lines, then `python3 ${CLAUDE_PLUGIN_ROOT}/bin/task_pr.py open T-004 --body-file <scratchpad>/pr.md`. It puts the task's commits on `task/T-004` (origin's main plus them), pushes, and opens the PR with the video in it. Run again later: it adds only the new commits.
- It stops on a commit that conflicts on main (it leans on another task's commit): tell the lead which one.
- A change once the PR is open, or the merge conflicts: land the fix on the dev branch, then run open again. Never fix on the task branch.

## Then
Notes: "PR: <url>"; the PR goes in your "For the user" block, under Links and in the question (the done skill).
