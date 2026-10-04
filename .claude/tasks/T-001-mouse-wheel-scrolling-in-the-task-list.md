---
id: T-001
title: Mouse-wheel scrolling in the task list
sprint: 2026-09-28
urgent: false
status: done
owner: board-scroll
rolled: 0
order: 0
created: 2026-10-03
---
## Goal
The better-tasks board's task list scrolls with the mouse wheel / trackpad, in addition to the existing keyboard navigation.

## Notes
- 2026-10-03 board-scroll: done in 5148256. `ui.scroll` hook on the pane (hooks/pane.tsx) moves the board's own list window (`wheeled`, `windowFrom` in hooks/board.tsx); selection follows into view; window stops before a task-less stretch; arrows snap back; ignored while moving/acting. State `listScroll` in types/index.d.ts. Tests: 3 new in tests/pane.test.ts, 167 pass.
- Unverified: live engine raising `ui.scroll` when the tree exactly fits the body (API doc says it fires "at its edges too"). PageUp/PageDown/Home/End may also arrive as `ui.scroll` while the pane holds the keys and would scroll the list the same way.
- Pre-existing, not mine: `tsc -p .` OOMs at default heap; with `NODE_OPTIONS=--max-old-space-size=12288` it shows only stale `mcp__better-tasks__*` tool-type errors (generated types out of date).
- 2026-10-03: User review of 5148256: "it doesn't work" (wheel scrolling over the board, tried live). Request changes.
- 2026-10-03 board-scroll, review "doesn't work": the engine (2.1.288 bundle) raises `ui.scroll` on every wheel tick over the pane box, even when the tree fits (offset clamps to 0, no skip); no focus needed; only with mouse tracking (fullscreen layout); not while an engine dialog is open. Suspects: (1) installed copy is the marketplace's 9d28962 (`~/.claude/plugins/cache/better-tasks/better-tasks/9d289628ca69`, no ui.scroll hook; `mod` not pushed); (2) only 3 tasks: ~16 list lines fit a tall pane, nothing to scroll; (3) non-fullscreen layout: no mouse events. Added a TEMPORARY status line in the ui.scroll hook (3c6b21f) for one live test; remove after.
- Type-check OOM: owned by teammate `typecheck` (T-003); plain `tsc -p .` now passes in <1 s with their tsconfig.
- 2026-10-03: User: "i want only the list to scroll, not to focus on the things below.. also it should scroll when there are no tasks in one section." → wheel moves only the view, never the selection/focus; scrolling must not stop at sections without tasks (headings-only stretches scroll too).
- 2026-10-03 board-scroll: user feedback: view-only scroll, edge to edge. `wheeled` now only clamps the window; the selection never moves. Open question for the live test: with the selected row scrolled out (its Button not drawn), do ↑/↓ still reach the board and snap the window back? Debug status line still in.
- 2026-10-03: User ran the live test of 7f4d66d: "Done", no problems reported.
- 2026-10-03 board-scroll: live test of 7f4d66d passed (user: "Done"). Debug status line removed. Commits: 5148256, 3c6b21f, 7f4d66d, and the removal below.
- 2026-10-03: The mouse wheel over the board scrolls only the list view, top to bottom (headings and empty sections too); the selection stays; ↑/↓ jump back to it.
