---
name: done
user-invocable: false
description: How a better-tasks teammate reports finished work: checks, the video and the PR first, then its notes, the "For the user" block the lead pastes into its question, and the done line. Load it when your task is done, and again when a requested change is done.
---

# Reporting done
The user is asked once your work is ready to merge: the PR and the video come before the question. No local build for the user unless they ask for one (the lead then opens or installs it for them).

## 1. Checks
- Quick checks first: the tests near your change, and your own try as a user.
- Then the full test suite (and the checks CI runs). Slow (many minutes)? Start it in the background and go on: your notes say "Full tests: running"; when it ends, send the lead "T-004 full tests pass", or fix a failure and tell the lead "T-004: full tests failed, fixing: <what>".

## 2. Video and PR
- Videos on: the `better-tasks:video` skill makes it, for every task (nothing on screen: the old and new text, labeled BEFORE and AFTER).
- A PR per task: the `better-tasks:pull-request` skill opens it, the video in it. Else your commits are final.

## 3. Notes and the "For the user" block
In the task file's Notes (task_note when it's outside your worktree), dated: what changed, the commits, the full tests (pass, or running), what you could not verify. Then, last, the block the lead pastes as written (a newer one replaces the old):

```
### For the user
Links:
Video: [/Users/me/app/.claude/tasks_videos/T-004.mp4](file:///Users/me/app/.claude/tasks_videos/T-004.mp4)
PR: [#12](https://github.com/o/r/pull/12)
Question:
T-004 Fix login redirect
What changed: after login you land on the page you asked for.
https://github.com/o/r/pull/12
Is everything OK?
```

- Links: the video's file path and the PR, each a markdown link on its own line. The video's label is its absolute path, the link its file:// url (spaces as %20): Claude Code opens it on click. No PR (no remote, or no PR flow)? Just the video.
- Question: for the user, plain words, short lines: id and title, what changed, a step only the user can do (a live test, a command, a setting), the PR url, "Is everything OK?". No jargon (commits, branches, test counts), no local build to install.
- The question's only link is the PR: the bare url on a line of its own, nothing else on it (no markdown, quotes, backticks, punctuation). Never the video: it's in Links.

## 4. Tell the lead
One line, "T-004 done: <commits or PR url>, see <task file>"; your final answer is the same line. Then wait; never set it done yourself: the lead merges and closes once the user marks it resolved.
Request changes: change it, checks, a new video when what it shows changed, push to the same PR, steps 3–4 again.
