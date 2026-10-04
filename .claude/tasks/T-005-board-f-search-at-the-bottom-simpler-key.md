---
id: T-005
title: Board: "f search" at the bottom, simpler key hints
sprint: 2026-09-28
urgent: false
status: done
owner: board-scroll
rolled: 0
order: 0
created: 2026-10-03
---
## Goal
On the better-tasks board, the "f search" hint moves to the bottom, and the key hints are organized nicely and more simply.

## Notes
- 2026-10-03 board-scroll: "them" read as the key hints (they were in 3 places, 3 styles). Top search line removed; key line at the bottom: `↑↓: select  ⏎: actions  f: search  c: settings` (acting `←→: choose  ⏎: run  ↑: back`, moving `↑↓: move  ⏎: stop`, no keys `Click or ctrl+x tab to use the board`); open search box replaces the key line (not while acting/moving). Box: `o: Open  s: Start  d: Done  m: Move` / `⌥↑ ⌥↓: Reorder  b: Backlog`; moving box no longer repeats keys. Screenshots regenerated. Not touched: settings page key line (configpage.tsx, "↑↓ choose · ⏎ change"), the tip in hooks/tips.ts.
- 2026-10-03: User live test: "pressing f, open the search but when i type it goes in the claude code input.." — the typing lands in the prompt, not the search box. Also: the settings page key line and tips text should follow the same "key: word" style.
- 2026-10-03 board-scroll: live bug "typing after f goes to the prompt": the engine keeps a pane's ring as an INDEX in drawing order; search Input drawn last → first letter changes the results above it → ring slides off. Fix 6445c18: Input drawn first, painted at the bottom (position absolute, bottom 0) over an empty key-line row; test checks it is first in drawing order. The move broke it (old top search was index 0).
- Settings key line in the same style (shared KeyHint): see the commit after 6445c18. Tips text is TIPS in hooks/texts.ts (coordinator-rules' file): asked the lead before editing.
- 2026-10-03 board-scroll: TIPS in hooks/texts.ts restyled (lead approved; only TIPS touched) with its test in tests/core.test.tsx.
- 2026-10-03: Search moved to the bottom key line (typing stays in the box); every key hint reads "key: word" on the board, the settings page and the tips.
