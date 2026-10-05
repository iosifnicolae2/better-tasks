---
id: T-047
title: "Board: select the task being asked about; video opens in the browser; Open PR action"
sprint: 2026-10-05
urgent: false
status: done
owner: board-actions
rolled: 0
order: -3
created: 2026-10-06
---
## Goal
User's words: "when a question is asked for a task, make sure to select it in the right sidebar so i can click open video, and open the video in the default browser, also add an open pr if one is attached".

- When the lead asks the user about a task (the AskUserQuestion with header "T-0xx"), the better-tasks board in the side pane selects that task automatically, so its actions are right there.
- The selected task's "Video" action opens the video in the default browser (`open` with the browser for the .mp4, or a local page that plays it), not QuickTime.
- New action "Open PR" (e.g. key P) on a task whose notes have "PR: <url>": opens the PR in the default browser. Hidden when there is no PR.
- Tests pass; quick checks and a local build first (claude --plugin-dir on the worktree), then report done.

## Notes
- 2026-10-06: Video: [T-047.mp4](../tasks_videos/T-047.mp4)
PR: https://github.com/iosifnicolae2/better-tasks/pull/28
board-actions: done, rebased on main 0dcd8bf (after T-046).
- Question selects its task: pane.tsx, a tool.call AskUserQuestion hook (main session only) finds the id in the header, else in the question text, and selects it before the question shows. It takes no keys. A closed task opens Closed; an open search closes; a board that is not open opens unfocused in the fullscreen layout (as for a new task).
- Video: demovideo.ts writes <id>.html beside the mp4 (git-ignored folder); pane.tsx opens it with `open -b <default browser id>`, the id read from LaunchServices (`plutil -extract LSHandlers`). If none is read: `open page.html`. QuickTime/osascript removed. Headless Chrome blocked sound on autoplay, so the page shows a "Play with sound" button in that case; one click plays it.
- Open PR: board.tsx prIn(body), the url on the last "PR:" line (bare or markdown link); button "p: Open PR" on open and closed tasks; opens with `open <url>`.
- Checks: claude plugin test . 308 pass; bunx tsc --noEmit clean; skills-check and settings-doc --check OK. Live in tmux (claude --plugin-dir on the worktree, scratch project, fake open/osascript that log): the lead's AskUserQuestion with header T-002 selected T-002 while showing; v ran `open -b com.google.chrome .../T-002.html`; p ran `open https://github.com/acme/shop/pull/12`. The page played in headless Chrome after the button click.
- Not verified: a real click in the user's own Chrome (autoplay with sound, or the button); non-macOS.
- Commits: a78cfc9, ff4b26c.

### For the user
Links:
[PR #28](https://github.com/iosifnicolae2/better-tasks/pull/28)
Question:
T-047 Board: select the asked task, video in the browser, Open PR
What changed: when I ask you about a task, the board on the right selects it. Its Video button now opens the video in your default browser. A new "Open PR" button (key p) opens the task's pull request.
To test: next time I ask about a task, look at the board: that task is selected. Click it, press Enter, then v for the video or p for the PR.
https://github.com/iosifnicolae2/better-tasks/pull/28
Is everything OK?
- 2026-10-06: Board selects the task the lead asks about; Video opens in the default browser; new Open PR action (p). 308 tests pass.
