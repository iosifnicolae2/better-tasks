# supermanager

A manager Claude that turns your wishes into clear tasks and dispatches isolated Claude Code agents, one per task.
Open this when you want to know how to run it or how the pieces talk to each other.

## What it does, in one picture

```
 you (Remote Control) ──► manager Claude ──► supermanager daemon ──► agent Claude (task T-001, worktree sm/T-001)
                              ▲                    │ backlog, slots,     agent Claude (task T-002, worktree sm/T-002)
                              └── "[supermanager]  │ notifications      ...
                                  T-001 is DONE"   ▼
                                            .supermanager/state.json
```

- **Manager**: one Claude Code session, Remote Control on, permissions skipped. Its only job is the backlog:
  ask you questions until a task is clear, create it, order it, spawn agents, relay results. It does not code.
- **Agents**: one Claude Code session per task, Remote Control on, started in **plan mode**. You approve the plan
  from your phone or browser, the agent implements, then calls `complete_task`. The daemon tells the manager.
- **Daemon + admin**: the `supermanager` command. Holds the backlog, enforces the concurrency limit, creates
  git worktrees, launches sessions in tmux, and shows everything in a terminal admin.
- **Isolation**: each agent gets its own worktree and branch `sm/<task-id>`. Agents get only their own MCP tools,
  and `SendMessage`/`ListAgents` are disabled, so they cannot talk to each other. All communication goes through
  the daemon.
- **CLAUDE.md**: sessions run inside the project (or its worktree), so Claude Code loads the project CLAUDE.md as
  usual. Uncommitted `CLAUDE.md`, `CLAUDE.local.md`, `.mcp.json` and `.claude/` are copied into new worktrees.

## Install

One command, nothing to clone first:

```sh
curl -fsSL https://raw.githubusercontent.com/bringes/supermanager/main/install.sh | sh
```

It installs `uv` and `tmux` if they are missing, clones this repo into `~/.local/share/supermanager/src`
(or updates it if it is already there), and links the global `supermanager` / `sm` commands to that folder.
Run the same command again to update.

Working on the code? Clone it yourself and link your checkout instead:

```sh
git clone https://github.com/bringes/supermanager
cd supermanager
./install.sh
```

**Editable** install means the commands are a link to the folder: edit `src/`, and the change is live
everywhere, no reinstall. Run `./install.sh` again after moving the folder or when `pyproject.toml` changes.

By hand: `brew install tmux` then `uv tool install --editable .`. Uninstall: `uv tool uninstall supermanager`.

## Use

```sh
cd your-project
supermanager
```

That is the whole start. The first run creates `.supermanager/config.toml` with defaults (no questions), then it
opens a tmux workspace and drops you straight into the **manager chat**. The manager is already running.
Tell the manager what you want; it asks until each task is clear, then dispatches agents.

One key is all you need: **`ctrl+a`**.

- In any Claude session, `ctrl+a` opens the **admin**. Every other key goes straight to Claude, so tmux never
  gets in the way of Claude Code's own shortcuts.
- In the admin, `ctrl+a` takes you back to the manager chat. `enter` on any row opens that session instead.
- The bottom bar lists the windows in order: `1 manager · 2 T-001 · 3 T-002 … · admin`. Click a name to switch
  (mouse is on, the wheel scrolls a session's output). A 🔔 marks a session that waits for you.
- The terminal tab title follows you: `<project> · manager · <what Claude is doing>`.

supermanager runs its own tmux server (`tmux -L supermanager`), so your own tmux config, bindings and sessions
are never touched. Inside it: no prefix key, `escape-time 10`, true colour, focus events, 50k lines of history.

The admin is two tabs, keyboard only:

| tab | what you see | keys |
| --- | --- | --- |
| **Agents** (`1`) | manager and every running agent: status, task, branch, name in claude.ai | `enter` open · `p` pause (sends Esc: Claude stops and waits for you) · `x` kill · `m` start or stop the manager |
| **Tasks** (`2`) | the backlog; each startable row shows its keywords `t ask manager · s spawn` | `t` ask the manager to start it · `s` spawn an agent directly · `i` edit the task file in your editor · `N` new task · `x` stop · `r` requeue · `d` cancel · `J`/`K` reorder |

`←`/`→` switch tab, `,` opens the settings popup, `?` the help. `q` leaves with everything running (`supermanager` brings you back).
`Q` quits and stops everything: manager and all agents (their tasks go back to the backlog and resume where
they left off next time). Any leftover manager from an older run is killed when a new one starts.

The same sessions are visible in claude.ai/code and the mobile app: the manager as `<project>-manager`, each agent
as `<project>-T-001`.

### When a session needs you: the bell 🔔

Whenever a session stops and waits for you — the manager asked a question, an agent's plan is ready to approve,
a tool needs permission, an agent reports it is blocked — supermanager rings a bell:

- your terminal beeps (macOS Terminal / iTerm can also bounce the dock icon; that is your terminal's bell setting),
- the window's name in the bottom bar turns amber with a 🔔 until you visit it (`ctrl+a`, then `enter` on its row),
- the admin shows `🔔 needs your permission: …` on that row; `enter` opens it and clears the bell.

The bell also clears by itself when the session gets going again (you answered, the plan was approved, the agent
reported progress). Turn it off with `supermanager config set notify.bell false`.

When a Claude session exits, its window is closed within a few seconds (no "Pane is dead" leftovers). If it
crashed, the exit status and its last lines land in the admin's events log.

Useful commands:

| command | what it does |
| --- | --- |
| `supermanager status` / `tasks` / `show T-001` / `events` | read state, works without the daemon |
| `supermanager add` | add a task by hand, same clarity checks as the manager |
| `supermanager start T-001` | ask the manager to dispatch a task (the manager never works on tasks itself) |
| `supermanager spawn [T-001]` / `stop T-001` | dispatch or stop an agent directly, bypassing the manager |
| `supermanager attach [manager\|T-001]` | open the tmux window in this terminal (`ctrl+a` then `q` to leave) |
| `supermanager manager start\|stop` | control the manager from another terminal |
| `supermanager config set agents.concurrency 10` | change settings (`config keys` lists them) |
| `supermanager -d` | open the admin first instead of the manager chat |
| `supermanager up --no-attach` | start everything and stay in your shell |
| `supermanager up --headless` | daemon only in this terminal, no tmux, no admin |

## Settings (`.supermanager/config.toml`)

| key | default | meaning |
| --- | --- | --- |
| `agents.concurrency` | 3 | how many agents may run at the same time |
| `agents.worktrees` | true | one git worktree + branch per agent |
| `agents.worktree_base` | HEAD | what new branches start from |
| `agents.allow_skip_permissions` | true | lets you pick "bypass permissions" when approving a plan |
| `agents.auto_trust` | true | answer Claude Code's "do you trust this folder?" for new worktrees automatically |
| `agents.auto_dispatch` | false | daemon starts the next task itself when a slot frees (manager still gets told) |
| `agents.auto_close_done` | false | close an agent's session 20 s after it reports done |
| `agents.model` / `manager.model` | "" | model override, e.g. `opus` |
| `manager.autostart` | true | start the manager as soon as the workspace opens |
| `manager.can_edit_files` | false | off disables Edit/Write tools for the manager, so it can only plan and dispatch |
| `manager.resume` | true | restart the manager with its previous conversation |
| `tasks.path` | .supermanager/tasks | folder for the task Markdown files, relative to the project |
| `tasks.min_problem_chars` | 60 | how much a problem description must say |
| `tasks.require_verification` | true | a task needs a "how to check" before it is accepted |
| `tasks.editor` | idea | command that opens a task file when you press `i` in the admin (`idea`, `code`, `vim`…) |
| `notify.bell` | true | ring the terminal bell and mark the window 🔔 when a session waits for you |

## Files

```
.supermanager/
  config.toml      settings (commit this)
  tasks/           one Markdown file per task (T-001.md) + _index.json order; commit this too.
                   Move it with `tasks.path`, e.g. `supermanager config set tasks.path docs/tasks`
  state.json       manager session, agent sessions and events (ignored)
  manager/         mcp.json, settings.json (hooks), prompt.md for the manager
  agents/T-001/    the same per agent
  worktrees/T-001/ agent worktrees (ignored)
```

## How the pieces talk

- Claude sessions load `supermanager mcp --role manager|agent` as an MCP server. It forwards every tool call to the
  daemon over a Unix socket (`~/.local/state/supermanager/run/<hash>.sock`).
- Claude Code hooks (`SessionEnd`, `Stop`, `UserPromptSubmit`, `Notification`, and `PostToolUse` on `ExitPlanMode`)
  call `supermanager hook ...` so the daemon knows when a plan was approved, when a session is idle or asks for a
  permission, and when it ended. That is what drives the bell.
- The daemon talks to the manager by typing a `[supermanager] ...` line into its tmux window.

## Task status flow

`backlog → planning → working → done`, with side exits `blocked` (agent needs you), `interrupted` (session ended
early; `spawn_agent` resumes it with its worktree and conversation) and `cancelled`.
