---
name: done
user-invocable: false
description: How a better-tasks teammate reports finished work: quick checks, a local build the user tries, its notes, the "For the user" block the lead pastes, the done line; then, once the user accepts, the finish (full tests, video, PR). Load it when your task is done, when a requested change is done, and when the lead says "accepted: finish it".
---

# Reporting done
Fast loop: the user tries a local build first; full tests, the video and the PR wait for their yes.

## 1. Quick checks, a local build
- Quick checks only: the tests near your change, and your own try as a user. Not the full suite yet.
- A local build the user can try right now: the `better-tasks:testing` skill's "Local build for the user".

## 2. Notes and the "For the user" block
In the task file's Notes (task_note when it's outside your worktree), dated: what changed, how to try the local build, the commits, what you could not verify. Then, last, the block the lead pastes into its question as written (a newer one replaces the old):

```
### For the user
Links:
Local build: [http://localhost:5173/login](http://localhost:5173/login)
Question:
T-004 Fix login redirect
What changed: after login you land on the page you asked for.
To try it: open the link, open a page, log in.
http://localhost:5173/login
Is everything OK?
```

- Links: the local build's link, when it has one, as a markdown link. None (an app on the device, a reloaded plugin)? Leave Links out.
- Question: for the user, plain words, short lines: id and title, what changed, how to try it, "Is everything OK?". No jargon (commits, branches, test counts).
- The question's only link is the local build's: the bare url on a line of its own, nothing else on it (no markdown, quotes, backticks, punctuation).

## 3. Tell the lead
One line, "T-004 done: <commits>, see <task file>"; your final answer is the same line. Then wait; never set it done yourself.
Request changes: change it, rebuild locally, steps 2–3 again. Full tests still wait.

## 4. Finish: the lead says "T-004 accepted: finish it"
- The full test suite (and the checks CI runs). A failure: fix it, tell the lead "T-004: full tests failed, fixing: <what>", go on.
- Videos on and it shows on screen: the `better-tasks:video` skill makes it.
- A PR per task: the `better-tasks:pull-request` skill. Else your commits are final.
- Notes: "Finished: full tests pass". Send the lead "T-004 finished: <commits or PR url>, see <task file>"; your final answer too.
