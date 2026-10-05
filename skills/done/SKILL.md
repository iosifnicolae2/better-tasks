---
name: done
user-invocable: false
description: How a better-tasks teammate reports finished work: its notes, the "For the user" block the lead pastes into its question to the user, and the done line. Load it when your task is done, and again when a requested change is done.
---

# Reporting done
The lead asks the user to test your work in your words: it pastes your "For the user" block, it doesn't rewrite it. Write it for the user, not for the lead.

## 1. Notes
In the task file's Notes, dated: what changed, how to test it, the commits, and what you could not verify. (The Video and PR lines: the video and pull-request steps.)

## 2. "For the user" block
Last in the Notes; a newer one replaces the old. Its shape:

```
### For the user
Links:
[PR #12](https://github.com/o/r/pull/12)
Question:
T-004 Fix login redirect
What changed: after login you land on the page you asked for.
To test: open a page, log in.
https://github.com/o/r/pull/12
Is everything OK?
```

- Question: plain words, short lines: the task id and title, what changed, how to test it, the links, then "Is everything OK?". No jargon (commits, branches, test counts): the details stay in the notes.
- The user must do something to test (a live test, a command, a setting)? The steps go in "To test".
- Links (a PR, a video, a page to test) go twice. Under "Links:", each a markdown link with a short label on a line of its own: `[PR #12](url)`, `[T-004 video](file:///Users/me/app/.claude/tasks_videos/T-004.mp4)` (spaces in a path as %20): Claude Code and the mobile app make these clickable. In the question: the bare url, each on a line of its own with nothing else on it (no markdown, quotes, backticks or punctuation): the question is plain text, so only a terminal that spots urls itself opens it. A file:// link opens only on this Mac; give it anyway.
- With a PR: its link, no video link (the PR's picture opens the video). Without a PR: the video's link, when there is a video.
- Videos on and your work shows on screen: no block without the video.

## 3. Tell the lead
Send the lead one line, "T-004 done: <commits>, see <task file>", and wait: the lead closes the task once the user resolves it; never set it done yourself. Your final answer is that same line: the lead gets it too.
