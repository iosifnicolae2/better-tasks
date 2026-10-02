# supermanager

A Claude Code mod that turns your main session into a **coordinator** of agent teammates,
with **weekly sprints**, **task files** and a **Tasks pane**.

> The old Python app (daemon, tmux, Textual dashboard) lives on the `main` branch.

## Quick guide

- **Create a task:** "create a task to fix the login redirect" → it asks *Now / This sprint / Next sprint / Backlog*. Nothing starts on its own.
- **Sprint goal:** "set the sprint goal: ship login". New sprint → it asks for the next goal and which backlog tasks to pull in.
- **Board:** `/tasks` (right sidebar). `↑↓` select · `enter` the task's menu (open, start, done, move) · `⌥↑ ⌥↓` move between sprints · `b` backlog · `c` settings.
- **Start work:** "start T-003" or **Start** → the coordinator gives it to the teammate that owns the area, or spawns one named by the area.
- **Go:** "go" → this sprint's tasks are worked in order.
- **Routing:** every message goes to the teammate already in that area. Teammate above the context limit (50 %) → handoff note in its task file, fresh teammate.
- **Planning:** only when you ask ("plan T-003 first") → the teammate plans, you approve.
- **Away:** `/away` → screens black, Mac keeps working; move the mouse to come back.
- **Settings:** `/config` → `supermanager.*`, or the config row at the bottom of `/tasks`.
- **Footer:** `Sprint 41 · 1/4 done · 1 due` (teammates: Claude Code's own list). Each session starts with short tips.

## What it does

- **Coordinator.** The main session routes every message to the teammate that already owns
  that area, or creates a task and spawns a teammate named by its area. It does not do the work itself.
- **Tasks ask "when?".** Creating a task never starts it. The coordinator asks
  *Now / This sprint / Next sprint / Backlog* unless you already said. "Now" starts at once.
- **Sprints** (YC / Linear style): fixed 1- or 2-week sprints, one sprint goal,
  backlog → sprint, unfinished work rolls over, a short review of what shipped.
- **Context-aware routing.** It tracks each teammate's context fill. A teammate above the
  limit (default 50 %) gets no new work: the coordinator asks it for a handoff note and starts a fresh one.
- **Tasks pane** (`/tasks`): see the sprint, open a task in your editor, start, move, finish, change settings.
- **Screen off, Mac awake** (`/away`): black screens until you touch the mouse or keyboard; the Mac does not sleep or lock.
- **Optional:** a git worktree per teammate; planning first only when you ask.

## Install

Needs Claude Code with agent teams on (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) and in-process
teammates (`teammateMode: in-process`; in tmux mode the context fill of teammates is not seen).

First load without agent teams: the mod stays off and asks Claude to add
`"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"` to the `env` block of `~/.claude/settings.json`
(you approve the edit), then to tell you to restart. If the flag is already in settings but
not in this session, the status line says to restart. The mod itself never writes settings.

Try it in one session (loads it for that session only):

```sh
claude --plugin-dir ~/Documents/Projects/claude-manager
```

All its hooks live inside the plugin; nothing is written to your settings files.

## Use

Talk to the main session as usual.

- "Create a task to fix the login redirect" → it asks when, writes the task file, starts nothing.
- "Set the sprint goal: ship login" → `sprint_goal`.
- "Go" → this sprint's tasks are worked in order.
- `/tasks` → the pane. `/away` → screens off.

When a new sprint starts, open work rolls over, `sprints.md` gets the review, and the
coordinator asks you for the new goal and which backlog tasks to pull in.

## Settings

In `/config` (rows `supermanager.*`) or the pane's config row.

| setting | default | what |
| --- | --- | --- |
| `editor` | `auto` | opens task files: `auto` (IntelliJ in a JetBrains terminal, VS Code in VS Code, else default), `default` (macOS `open`), `code`, `idea`, `cursor`, `zed` |
| `worktree` | off | each named teammate works in its own git worktree |
| `contextLimit` | 50 | % of context above which a teammate gets no new work |
| `keepAwake` | on | holds `caffeinate` while any teammate runs |
| `sprintWeeks` | 1 | sprint length in weeks (1 or 2) |
| `sprintStart` | monday | weekday a sprint starts |

## Files it keeps (per project)

- `.claude/manager/tasks/T-001-short-slug.md`: one task: frontmatter (`sprint`, `status`, `owner`, `rolled`, …) + Goal, Notes, Plan.
- `.claude/manager/sprints.md`: each sprint's goal and review.
- `docs/tasks.md`: one row per finished task.

## The model's tools

`task_create`, `task_update`, `task_list`, `sprint_goal`, `team_status`, `screen_off`
(listed as `mcp__supermanager__*`).

## Develop

```sh
claude plugin validate .   # what the engine will load
claude plugin test .       # tests/*.test.ts
```

Code map: `hooks/register.tsx` wires every core hook and the one `session.start` (`$` and state refs never cross an import);
`tasks.ts`, `taskflow.ts`, `sprints.ts`, `sprintlog.ts`, `boundary.ts`, `team.ts`, `coordinator.ts`,
`tools.ts` hold the logic; `pane.tsx` the Tasks pane; `screen.ts` + `bin/blackout.js` the screen-off.
