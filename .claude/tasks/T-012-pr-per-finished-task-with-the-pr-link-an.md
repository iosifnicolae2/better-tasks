---
id: T-012
title: PR per finished task, with the PR link and video in the approval
sprint: 2026-09-28
urgent: false
status: done
owner: demo-videos
rolled: 0
order: -1
created: 2026-10-04
---
## Goal
User's request (verbatim): "also, create another config to create PRs with the changes, and in the approval add the link to the PR and in the PR find a way to embed the video, find a solution on how to do it.."

What this means for the better-tasks plugin:
- A new setting (next to "Before/after videos" in /better-tasks config) that turns on "PR per task": a teammate's finished changes go up as a GitHub pull request (gh CLI).
- The lead's approval (Finishing) question shows the PR link, on its own line, short enough to stay clickable and on one row (same lesson as T-011: long links wrap and only part is clickable).
- When the task has a before/after video (T-011), the PR shows it. Research and pick a way that really displays on GitHub: GitHub only plays videos inline when uploaded through its web UI (user-attachments), and there is no official API for that. Candidates to check: a GIF preview committed on the PR branch and shown inline, linking to the mp4; the mp4 as a release asset or on a separate branch; any gh/API route that gives a user-attachments URL. Prove the chosen way on a real test PR and say what it looks like.
- Branches: the user's global rule is "commit on the current branch, no branches unless I ask". This setting is that ask, but only while it is on; when it is off, keep committing on the current branch. Decide what happens when the PR merges (who merges, and when), and say it in the notes.
- Ties to T-011 (video setting, approval question rule): build on that code, don't duplicate it.

Done looks like: setting exists; with it on, a finished task produces a PR with the video visible in it; the approval question carries the PR link that is clickable in one row; one real sample PR made and linked in this file.

## Notes
- 2026-10-04: demo-videos: done, waiting for the user's review. Commit 4004914. Not pushed; no PR on the real repo.

What I built:
- Setting "PR per task" (`pullRequests`, off by default), next to "Before/after videos" in /better-tasks config, also in /config and config.json.
- When on, each named teammate is spawned in its own git worktree, so branches never collide in one checkout. When done, it pushes to `task/<id>` and opens the PR with `gh pr create`, body in plain words: what changed, how to test, the task file. Its notes get "PR: <url>". Request changes means more pushes to the same PR. Teammates never merge.
- Video in the PR: `gh pr create --attach <video>`, new in gh 2.99 (2026-09-01). It uploads the mp4 as a GitHub user-attachment, the only kind GitHub plays inline. The body's `![Before/after video](<path>)` is replaced by that attachment link. No repo files, no extra branch.
- Approval question: the PR link sits on a line of its own (about 50–60 characters, one row), before the video's file:// link. "Mark as resolved" merges: the lead runs `gh pr merge <url> --squash --delete-branch`, then `git pull --ff-only`, then closes the task with the merge commit. On a conflict, the teammate updates its branch from main and pushes, then the lead merges.
- Merge decision: the lead merges, only after the user approves, one squash commit per task on main (one line per task in the release notes). With the setting off, nothing changes: commits stay on the current branch, as the user's global rule says.
- gh check: when the setting is on (startup) or gets turned on, a toast and log line appear if gh is missing or older than 2.99.
- README line.

Proof on a real test PR (private throwaway repo iosifnicolae2/better-tasks-pr-test):
- https://github.com/iosifnicolae2/better-tasks-pr-test/pull/1 has the T-011 sample video uploaded with --attach. GitHub renders the body as a `<video controls>` player, and the asset serves as video/mp4. Open it to see the player under "Before / after".
- https://github.com/iosifnicolae2/better-tasks-pr-test/pull/2 tested the lead's merge step: squash-merged, branch deleted.

User must do:
- `brew upgrade gh`: this Mac has gh 2.98.0, which has no --attach. (I tested with gh 2.102.0 downloaded into the scratchpad; nothing global changed.) Without the upgrade, PRs work but carry no video, and the toast says so.
- Delete the test repo when done: `gh repo delete iosifnicolae2/better-tasks-pr-test` (may need `gh auth refresh -s delete_repo`).

To test: brew upgrade gh, turn on "PR per task" (and "Before/after videos") in /better-tasks config, give the team a small task. The approval question shows the PR link on its own row; open it to see the video playing. Mark as resolved merges it.

Checks: `claude plugin test .` 185 pass, 0 fail (new: the gh version check; PR on → worktree + PR rules + the lead's merge rule). tsc clean.

Not verified:
- A full live teammate cycle with the setting on.
- That the PR link stays one row in the live approval dialog (measured lengths: 50–60 characters).
- How --attach behaves on repos of paid plans or orgs with attachment policies.
- 2026-10-04: Resolved by the user. Setting "PR per task": teammates work in a worktree, open a PR with the before/after video attached (gh 2.99+), the approval question shows the PR link, and "Mark as resolved" squash-merges it. Sample PR #1 on the test repo merged. gh upgraded 2.98 → 2.102 on this Mac. Follow-up (gh auto-update on other machines) filed separately.
