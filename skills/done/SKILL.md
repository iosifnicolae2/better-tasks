---
name: done
user-invocable: false
description: How a better-tasks teammate reports finished work: its notes, the "For the user" block the lead pastes into its question to the user, and the done line. Load it when your task is done, and again when a requested change is done.
---

# Reporting done
The lead asks the user to test your work in your words: it pastes your "For the user" block, it doesn't rewrite it. Write it for the user, not for the lead.

## 1. Notes
In the task file's Notes, dated: what changed, how to test it, the commits, and what you could not verify. (The Video and PR lines: the video and pull-request steps.)
The task file is outside your worktree, so you can't edit it? Add all of this, the block below too, with the task_note tool.

## 2. "For the user" block
Last in the Notes; a newer one replaces the old. The lead shows "Links:" as text right above its question, and "Question:" as the question. Its shape:

```
### For the user
Links:
Video: [/Users/me/app/.claude/tasks_videos/T-004.mp4](file:///Users/me/app/.claude/tasks_videos/T-004.mp4)
PR: [#12](https://github.com/o/r/pull/12)
Question:
T-004 Fix login redirect
What changed: after login you land on the page you asked for.
To test: open a page, log in.
https://github.com/o/r/pull/12
Is everything OK?
```

- Links: the video's file path (when there is one) and the PR, each a markdown link on its own line, clickable in Claude Code and the mobile app. The video's label is its absolute path, the link its file:// url (spaces as %20): Claude Code opens it on click. No PR (no remote)? Just the video.
- Question: plain words, short lines: task id and title, what changed, how to test it (steps the user must do: a live test, a command, a setting), the PR url, "Is everything OK?". No jargon (commits, branches, test counts): details stay in the notes.
- The question's only link is the PR: the bare url on a line of its own, nothing else on it (no markdown, quotes, backticks, punctuation). Never the video: it's in Links.
- Videos on and your work shows on screen: no block without the video.

## 3. Tell the lead
Send the lead one line, "T-004 done: <commits>, see <task file>", and wait: the lead closes the task once the user resolves it; never set it done yourself. Your final answer is that same line: the lead gets it too.
