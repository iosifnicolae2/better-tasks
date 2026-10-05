---
name: done
user-invocable: false
description: How a better-tasks teammate reports finished work: quick checks, the local build the user tries, its notes, the "For the user" block the lead pastes into its question to the user, the done line, then the finish after the user accepts. Load it when your task is done, again when a requested change is done, and when the lead says "accepted: finish it".
---

# Reporting done
Fast loop: the user tries your change on a local build first; full tests, the PR and the video wait for their yes.
The lead asks the user to test your work in your words: it pastes your "For the user" block, it doesn't rewrite it. Write it for the user, not for the lead.

## 1. Quick checks, a local build
- Quick checks only: the tests near your change, and your own try as a user (the `better-tasks:testing` skill). Not the full suite yet.
- A local build the user can try right now, on their machine or device: the testing skill's "Local build for the user".

## 2. Notes
In the task file's Notes, dated: what changed, how to try the local build, the commits, and what you could not verify.
The task file is outside your worktree, so you can't edit it? Add all of this, the block below too, with the task_note tool.

## 3. "For the user" block
Last in the Notes; a newer one replaces the old. The lead shows "Links:" as text right above its question, and "Question:" as the question. Its shape:

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

- Links: the local build's link, when it has one (a URL, a file), a markdown link on its own line. None (an app on the device, a reloaded plugin)? Leave Links out.
- Question: plain words, short lines: task id and title, what changed, how to try the local build (where it is, the steps), "Is everything OK?". No jargon (commits, branches, test counts): details stay in the notes.
- The question's only link is the local build's: the bare url on a line of its own, nothing else on it (no markdown, quotes, backticks, punctuation).

## 4. Tell the lead
Send the lead one line, "T-004 done: <commits>, see <task file>", and wait: the lead closes the task once the user resolves it and you finish; never set it done yourself. Your final answer is that same line: the lead gets it too.
Request changes: change it, rebuild locally, then steps 2–4 again. Full tests still wait.

## 5. Finish: the lead says "T-004 accepted: finish it"
- The full test suite (and the checks CI runs). A failure: fix it, tell the lead in one line "T-004: full tests failed, fixing: <what>", then go on.
- Video on and the work shows on screen: make it now (the `better-tasks:video` skill, "Make it").
- A PR per task: the `better-tasks:pull-request` skill opens the PR. Else your commits are final.
- Notes: "Finished: full tests pass", the Video and PR lines. Send the lead "T-004 finished: <commits or PR url>, see <task file>"; that is your final answer too.
