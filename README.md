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
  every request you type becomes a task and gets an agent right away (it asks only when it truly cannot write
  a checkable task); it orders the backlog, spawns agents and relays results. It does not code.
- **Agents**: one session per task — Claude Code (Remote Control on, started in **plan mode**) or **Codex** (it
  presents its plan in the chat and waits for your yes). Per task you can pick the tool, model and effort; the
  manager does it when you ask ("use codex for this one", "opus, max effort"). You approve the plan
  from your phone or browser, the agent implements, then calls `complete_task`. The daemon tells the manager.
- **Daemon + tasks page**: the `supermanager` command. Holds the backlog, enforces the concurrency limit, creates
  git worktrees, launches sessions in tmux, and shows everything on one terminal page.
- **The task file is the shared memory**: the agent writes its plan into it (`update_plan`), appends what it
  discovers (`add_context`) and its milestones (`report_progress`), so the user, the manager and whoever resumes
  the task later all read the same file. It also keeps a record of every session that worked on the task — tool,
  model, effort, session id and the transcript, copied next to the task files when the session ends.
- **Finishing**: when the work is verified, the agent asks you in its own chat whether to commit and merge its
  branch into the base branch. Say yes and it commits whatever is left, merges, marks the task done and its
  session closes; say no and only the task is closed — the branch waits for you.
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

A workspace that is already open keeps running the code it started with (the daemon and the three pages are
long-lived processes). To pick up your edits without stopping the agents:

```sh
pkill -9 -f "supermanager dashboard -C $PWD"        # -9: a plain kill would stop the agents too
pkill    -f "supermanager (agents-page|config-page) -C $PWD"
supermanager up                                     # the pages come back, the agents kept running
```

By hand: `brew install tmux` then `uv tool install --editable .`. Uninstall: `uv tool uninstall supermanager`.

## Use

```sh
cd your-project
supermanager
```

That is the whole start. The first run creates `.supermanager/config.toml` with defaults (no questions), then it
opens a tmux workspace and drops you straight into the **manager chat**. The manager is already running.
Tell the manager what you want; each request becomes a task with an agent on it, and you approve the agent's
plan from your phone or browser.

One key is all you need: **`ctrl+a`** cycles through the pages: **manager → tasks → agents → config** → manager.
On a page, `←` / `→` do the same one step at a time.

- The bottom bar shows `manager · tasks · agents · config`, with a count in parentheses next to `tasks` (open tasks) and `agents`
  (running agents) when it is not zero. Agent windows stay out of it: open one with `enter` on its task (tasks or
  agents page); while you are inside an agent the `agents` tab is highlighted (click it to get the list), and an
  agent that rings 🔔 for you shows up until you visit it. `ctrl+a` from an agent brings you to the tasks page.
- Every other key goes straight to Claude, so tmux never gets in the way of Claude Code's own shortcuts. The
  mouse works too: click a name in the bar, the wheel scrolls a session's output.
- Every page shows its shortcuts in a footer, `ctrl+w` searches (type, the rows narrow down; `esc` clears — like
  nano's "where is"), and a click on a column title sorts by it: ▲ up, ▼ down, a third click back to the page's
  own order. Column widths are fixed, so a bell or a longer status never moves the rest of the row.
- The terminal tab title follows you: `<project> · manager · <what Claude is doing>`.

supermanager runs its own tmux server (`tmux -L supermanager`), so your own tmux config, bindings and sessions
are never touched. Inside it: no prefix key, `escape-time 10`, true colour, focus events, 50k lines of history.

The **tasks** page is the backlog, keyboard only (done / blocked / error events also pop up there as notices).
Tasks with a running agent come first, then the rest by priority and backlog order; a click on a column title
sorts by that column instead. Finished tasks are hidden until you press `h`.

| key | does |
| --- | --- |
| `enter` (or click) | open the task's agent; a task without one opens its file in your editor |
| Agent column (click) | start an agent on a waiting task · open the agent of a running one |
| `n` | new task from the template: title only, then the file opens in your editor |
| `i` | edit the task file |
| `s` | start an agent on it (`t` asks the manager to do it instead) |
| `p` | pause its agent (sends Esc: it stops and waits for you) |
| `x` / `d` / `r` | delete it · mark it done (stops its agent) · requeue |
| `X` | stop its agent, task back to the backlog |
| `J` / `K` | move down / up in the backlog |
| `m` | start or stop the manager |
| `h` | show / hide the finished tasks (hidden by default) |
| `?` | every other key |

The **config** page lists every setting as a switch or a field; a change is saved the moment you make it (the
manager can change the same settings when you ask it).

The **agents** page lists the running agents, one row each, named by their Remote Control name
(`<project>-T-001`, `<project>-A-001`; Codex agents by their id) — with the tool, model and effort they run with,
phase, the task the agent works on and how far it is (`planning` → `working`; free agents, started with `n`, have
none: they are plain sessions in the project root), branch, how long each has run, and a 🔔 when one waits for you
(`plan ready — approve it`, a question, a permission). Every notice lands here too — plan ready, blocked, done,
interrupted — because this is the page about the running work; the tasks page stays quiet, it is the roadmap.
`enter` (or a click) opens the agent's window, `i` edits its task file, `x` stops it.
`supermanager events` prints the event log from the shell.

**New task from the template** (`n`): you type only a title; the task file is created from the
template and opened in your editor (`tasks.editor`). Fill it in, save, then `t` or `s` to start it. The default
template has the five sections (Problem, Expected outcome, Acceptance criteria, Verification, Context); to change
it for a project, put your own in `.supermanager/task-template.md` with the same `## ` headings.

`?` shows the help. `q` leaves with everything running (`supermanager` brings you back).
`Q`, or `ctrl+c` twice on any page, quits and stops everything: manager and all agents (their tasks go back to the
backlog and resume where they left off next time). Closing the manager chat itself (`ctrl+c` twice, or `/exit`) does the same
(`manager.exit_closes_all`). Any leftover manager from an older run is killed when a new one starts.

The same sessions are visible in claude.ai/code and the mobile app: the manager as `<project>-manager`, each agent
as `<project>-T-001`.

### When a session needs you: the bell 🔔

A session that ends its turn with a background shell or a monitor still running is not waiting for you:
supermanager reads its status line, stays quiet, and looks again a few seconds later.

Whenever a session stops and waits for you — the manager asked a question, an agent's plan is ready to approve,
a tool needs permission, an agent reports it is blocked — supermanager rings a bell:

- your terminal beeps (macOS Terminal / iTerm can also bounce the dock icon; that is your terminal's bell setting),
- the window's name shows up in the bottom bar, amber with a 🔔, until you visit it (click it, or `enter` on the
  agents page),
- the agents page shows `🔔 needs your permission: …` in the row's last column and pops up a notice; `enter`
  opens the session and clears the bell.

The bell also clears by itself when the session gets going again (you answered, the plan was approved, the agent
reported progress). Turn it off with `supermanager config set notify.bell false`.

When a Claude session exits, its window is closed within a few seconds (no "Pane is dead" leftovers). If it
crashed, the exit status and its last lines land in `supermanager events`.

Useful commands:

| command | what it does |
| --- | --- |
| `supermanager status` / `tasks` / `show T-001` / `events` | read state, works without the daemon |
| `supermanager add` | add a task by hand, same clarity checks as the manager |
| `supermanager start T-001` | ask the manager to dispatch a task (the manager never works on tasks itself) |
| `supermanager spawn [T-001]` / `stop T-001` | dispatch or stop an agent directly, bypassing the manager |
| `supermanager attach [manager\|T-001]` | open the tmux window in this terminal (`ctrl+a` to the tasks page, then `q` to leave) |
| `supermanager manager start\|stop` | control the manager from another terminal |
| `supermanager config set agents.concurrency 10` | change settings (`config keys` lists them) |
| `supermanager -d` | open the tasks page first instead of the manager chat |
| `supermanager up --no-attach` | start everything and stay in your shell |
| `supermanager up --headless` | daemon only in this terminal, no tmux, no page |

## Settings (`.supermanager/config.toml`)

| key | default | meaning |
| --- | --- | --- |
| `agents.concurrency` | 3 | how many agents may run at the same time |
| `agents.worktrees` | true | one git worktree + branch per agent |
| `agents.worktree_base` | HEAD | what new branches start from |
| `agents.merge_into` | "" | branch an agent merges into when you approve at the end ("" = the branch the project is on) |
| `agents.allow_skip_permissions` | true | lets you pick "bypass permissions" when approving a plan |
| `agents.auto_trust` | true | answer Claude Code's "do you trust this folder?" for new worktrees automatically |
| `agents.auto_dispatch` | false | daemon starts the next task itself when a slot frees (manager still gets told) |
| `agents.close_done_after` | 20 | seconds before the session of an agent that reported done is closed (it always is) |
| `agents.tool` | claude | what agents run by default: `claude` or `codex`; a task can say otherwise (`tool`, `model`, `effort` in its file) |
| `agents.model` / `manager.model` | "" | model override, e.g. `opus` (or `gpt-6-astra` when the tool is codex) |
| `agents.effort` / `manager.effort` | "" | effort override: claude `low`…`max`, codex `minimal`…`xhigh` |
| `agents.codex_extra_args` | [] | appended to every `codex` command line (`agents.extra_args` is for `claude`) |
| `manager.autostart` | true | start the manager as soon as the workspace opens |
| `manager.can_edit_files` | false | off disables Edit/Write tools for the manager, so it can only plan and dispatch |
| `manager.exit_closes_all` | true | closing the manager chat (`ctrl+c`) stops everything: agents, tasks page, tmux workspace |
| `manager.resume` | true | restart the manager with its previous conversation |
| `tasks.path` | .supermanager/tasks | folder for the task Markdown files, relative to the project |
| `tasks.min_problem_chars` | 60 | how much a problem description must say |
| `tasks.require_verification` | true | a task needs a "how to check" before it is accepted |
| `tasks.hide_done` | true | finished tasks (done, cancelled) start hidden on the tasks page; `h` shows them |
| `tasks.keep_transcripts` | true | copy each finished session's transcript into `<tasks>/sessions/<task-id>/` |
| `tasks.gitignore_transcripts` | true | keep those copies out of git (off = they are committed with the tasks) |
| `tasks.editor` | idea | command that opens a task file on `enter` (`idea`, `code`, `vim`…) |
| `notify.bell` | true | ring the terminal bell and mark the window 🔔 when a session waits for you |

## Files

```
.supermanager/
  config.toml      settings (commit this)
  task-template.md optional: your own template for `n` (new task)
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
- Codex agents get the same MCP server and hooks another way: the server and the instructions are `-c` overrides
  on the `codex` command line, the hooks live in `<agent folder>/.codex/hooks.json` (hidden from git through
  `.git/info/exclude`). Codex has no plan mode, so a Codex agent calls the `plan_approved` tool once you said yes;
  its session id comes in with the first hook and `spawn_agent` resumes it with `codex resume <id>`.
- The daemon talks to the manager by typing a `[supermanager] ...` line into its tmux window.

## Task status flow

`backlog → planning → working → done`, with side exits `blocked` (agent needs you), `interrupted` (session ended
early; `spawn_agent` resumes it with its worktree and conversation) and `cancelled`.
