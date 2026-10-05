---
id: T-045
title: "better-tasks in Claude Desktop: shared interface, Claude-native look"
sprint: 2026-10-05
urgent: true
status: cancelled
owner: desktop-2
rolled: 0
order: -1
created: 2026-10-05
---
## Goal
User's words: "can we make this mod to also work in claude desktop? if yes, build a shared interface between the two, make things look claude native".

1. Find out: can better-tasks (hooks module: pane, board, config page, toasts, tools, hooks) run in Claude Desktop's Code tab? The plugin-authoring skill says mods run "inside Claude Code (terminal or desktop Code tab)". Check what the engine's UI parts render as on desktop, what's missing, and how a mod tells which host it's in. Check this for real, not from memory.
2. If no (or only in part): write in the notes what works and what doesn't, and why. Report that before building anything big.
3. If yes: build one shared interface layer, so the board, pane, config page and questions are described once and render well in both the terminal and desktop. Make it look Claude-native in each: use the engine's own components, theme colors, spacing and type, not a custom style.
- Keep the terminal look as good as today, or better.
- Tests pass; screenshots of both hosts, before and after.
- Flow: quick checks and a local build first (desktop: how to load the worktree build there), then report done.

This repo is better-tasks upstream itself, so no fork is needed.

## Notes
- 2026-10-06: User decisions: (1) plan approved: go ahead with the shared look layer (hooks/look.tsx). (2) Desktop check: the teammate may capture only the Claude window itself (screencapture -l, in the background), never clicking or typing in the user's app. The user does what needs hands in Desktop (opens a Code session, types /better-tasks, loads the worktree build); the lead asks the user for those steps.
- 2026-10-06: User sent a screenshot of the BEFORE (current release, Claude Desktop, /better-tasks open now). It shows: the pane titled "Sprint" with an orange "Better Tasks" label; terminal-style rows (⚡ Currently working on, ◆ This sprint with a green ▰▰▰▰▰ bar 29/31, ◇ Next sprint, ○ Backlog, "— empty"); a selected-task box at the bottom with key-chip actions (O Open, V Video, D Done, M Move, ⌥↑ ⌥↓ : Reorder, B Backlog); hints "↑↓: select ⏎: actions F search C settings"; the status text in the box wraps badly ("Currently working on" cut off); long titles get cut off on the right.
User's words: "improve it to look more claude code ui, not like terminal, make it look much better, clicking on something will open a nice modal and so on.."
So on Desktop: a real Claude Code-style UI, not terminal glyphs or key chips. Clickable task rows that open a nice modal (task details and its actions as buttons); proper section headers, cards or rows, a progress bar, no keyboard hints; text that wraps or truncates cleanly. Aim high on looks.
- 2026-10-06: User's words: "make sure to also reorganize by groups the settings". The settings page (Desktop and terminal) shows the settings in clear groups with a header each, e.g. Team, Git & PRs, Testing & videos, Models, Display. Group them by what they're about.
- 2026-10-06: Request changes after trying the build in Desktop (user's words): "the modal is not that good.. the controls are not easy to type.. the scrolling is broken the spacing is not right make it like before a bit simpler and a bit like terminal, but make it fully working 100%".
The user's screenshots showed:
1. The modal: a header line "In progress · ⚡ Currently working on · T-045" and a Close button, then the title, "desktop · not running", and the whole goal drawn as Markdown. The modal is cut off at the bottom (the text runs past it, no scroll), and the board behind it shows through at the edges. There are no action buttons visible.
2. The closed list: "Hide 44 closed", then big bordered cards per task (✓, title, T-0xx below). The cards are too tall and spaced too much, and the titles are cut off on the right.
Direction: go back toward the earlier, simpler, terminal-like layout. Use compact rows, not big cards, and tighter spacing. Controls must be easy to use. Scrolling must work everywhere (board, modal, settings). Long text must wrap or truncate cleanly. A simpler task detail is fine (short, with its actions in reach, not a wall of Markdown). Everything must work 100%: check each control and scroll in the real Desktop app via window captures before reporting done.
Test setup: ~/.claude/settings.json already points CLAUDE_CODE_PLUGIN_DIRS at the worktree, with the released better-tasks off. The lead restores it after the test. To pick up an edit, the user reopens /better-tasks or reloads plugins in Desktop.
- 2026-10-06: User: "also sometimes i have to press the buttons twice.." in Desktop. Find out why (focus? re-render? a first click that only selects?) and make every button act on the first click.
- 2026-10-06: Feedback on v2 in Desktop (user's words): "the scrolling must be inside the modal.. the buttons should be put to top.. the margins are missing between finished tasks".
- Task detail: a modal over the board again (not inline). Its content scrolls inside the modal; the modal itself always fits the pane.
- The modal's buttons go at the top, under the header, so they are always visible.
- Finished (closed) tasks: add spacing between the rows.
Keep the rest of v2: compact rows, one-click buttons, settings layout.
- 2026-10-06: 2026-10-06: Status check found no teammate running for T-045. Spawned desktop-2 to continue with the v2 feedback.
- 2026-10-06: User: "still the scrolling is not working right.. drop claude desktop support for now". Dropped for now. The work is kept unmerged on branch worktree-agent-a4fd357a8255c38b4 (last commit 3f35ed6: v3 modal, settings groups, one-click fix). Settings restored from backup.
