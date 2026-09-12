# supermanager

**Run a team of coding agents on one project, from one terminal — or from your phone.**

You say what you want. A manager Claude turns it into a checkable task and puts an agent on it, in its own git
worktree. You approve the plan, the agent works, asks whether to merge, and cleans up after itself.
Agents run on **Claude Code** or **OpenAI Codex** — your pick, per project or per task.

```
 you ──► manager Claude ──► supermanager daemon ──► agent (T-001, worktree sm/T-001, claude opus)
          (Remote Control)        backlog             agent (T-002, worktree sm/T-002, codex  high)
                ▲                 slots               ...
                └── "T-001 is DONE, merged into main"
```

Everything is a tmux window on a private tmux server: the manager chat, each agent, and three pages. `ctrl+a`
(or `←` `→`) cycles them; every other key belongs to the tool you are looking at.

---

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/bringes/supermanager/main/install.sh | sh
```

Installs `uv` and `tmux` if they are missing, clones the source to `~/.local/share/supermanager/src`, and links
the `supermanager` (short: `sm`) commands to it. It follows releases from there: `supermanager up` says once a
day when a newer one is out, `supermanager upgrade` installs it, and `SUPERMANAGER_AUTO_UPGRADE=1` does that for
you. Working on supermanager itself? Clone it and run `./install.sh` in your checkout — the commands link to that
folder, your edits are live, and nothing nags you about updates (a fork is told when upstream publishes a
release, and that is all).

## Start

```sh
cd your-project
supermanager
```

The first run writes `.supermanager/config.toml` and drops you into the manager chat. Say what you want:

> *"The CSV import drops rows with a BOM. Fix it and add a test."*

The manager writes the task, starts an agent and tells you the id. The agent explores, presents a plan, and
waits. You approve it here, in claude.ai, or on your phone — these are Remote Control sessions.

---

## The three pages

### tasks — the roadmap, as a table or a board

```
 ID      Pri  Status     Title                         Labels        When         Agent               Created         Updated
                         backlog  (2)
 T-002   P2   backlog    Retry failed uploads           api                        ▶ start (s)         09/13/26 01:55  09/13/26 01:55
 T-003   P2   backlog    Ship the release notes         docs         2026-09-20    ▶ start (s)         09/12/26 18:02  09/13/26 01:41
                         working  (1)
 T-001   P2   working    Fix the BOM in the CSV import  import  bug  2026-W38      demo-T-001 · busy   09/12/26 09:20  09/13/26 01:52
 ^w Search  n New task  s Start  p Pause  x Delete  d Done  i Edit file  h Show done  v Board/table  ? Help  q Leave
```

Grouped by status, with running agents first. `enter` opens the agent (or the task file when there is none),
`s` starts one, `n` writes a new task, `ctrl+w` searches every column, a click on a title sorts it (up, down,
off — `Created` and `Updated` sort by time), `g` changes what it groups by, `G` drops the headings. Dates are
written the way this machine writes them.

`v` turns it into a board:

```
╭─ backlog  2 ─────────────────╮ ╭─ planning  1 ────────────────╮ ╭─ working  1 ─────────────────╮ ╭─ blocked ───────╮
│ ╭──────────────────────────╮ │ │ ╭──────────────────────────╮ │ │ ╭──────────────────────────╮ │ │                 │
│ │ T-002  P2                │ │ │ │ T-004  P2                │ │ │ │ T-001  P2                │ │ │  nothing here   │
│ │ Retry failed uploads     │ │ │ │ Cache the avatar         │ │ │ │ Fix the BOM in the CSV   │ │ │                 │
│ │  api                     │ │ │ │ thumbnails               │ │ │ │ import                   │ │ │                 │
│ │ ▶ start (s)              │ │ │ │  perf   api              │ │ │ │  import   bug            │ │ │                 │
│ ╰──────────────────────────╯ │ │ │ demo-T-004 · busy        │ │ │ │ 2026-W38                 │ │ │                 │
│ ╭──────────────────────────╮ │ │ ╰──────────────────────────╯ │ │ │ demo-T-001 · busy        │ │ │                 │
│ │ T-003  P2                │ │ │                              │ │ ╰──────────────────────────╯ │ │                 │
```

Arrows move the selection, **shift+←/→ move the task**: on a status board that starts it, closes it or puts it
back in the backlog; on a label board it moves the label. shift+↑/↓ move it up and down the backlog.
`g` groups by status, labels, your scheduled date, or any field you defined.

### agents — what is running right now

```
 Agent        Phase   Task                            Status     Branch     Started   Active   Needs you
 demo-T-002   busy    T-002  Retry failed uploads     working    sm/T-002   1m        5s
 demo-T-005   idle    T-005  Fix the BOM in the CSV   planning   sm/T-005   7m        1m       🔔 plan ready — approve it
 demo-A-001   idle    no task · project root                                1h00m     15m
 ^w Search  n New agent  i Edit task  x Stop  q Leave
```

Every notice lands here — plan ready, blocked, done, interrupted — so the roadmap stays quiet. `enter` jumps into
a session, `n` starts a free agent (no task, just a session in the project root). Columns are as wide as what is
in them; what an agent runs with (claude/codex, model, effort) is in its task file and in `supermanager events`.

### config — every setting, saved as you change it

```
 Setting                    Value     What it does
 agents.concurrency         3         How many agents may run at the same time.
 agents.worktrees           [x] on    Give each agent its own git worktree and branch sm/<task>.
 agents.tool                codex     [from config.local.toml] What agents run by default: claude or codex.
```

### the bar

```
 cx │ tasks (2)  agents (1)  config        ctrl+a / ← → pages
```

Open tasks and running agents, counted. Agent windows stay out of it; while you are inside one, `agents` lights
up — click it for the list. A session that needs you rings 🔔 there and in your terminal.

---

## What you can do with it

| | |
| --- | --- |
| **Talk, don't file tickets** | every request becomes a task with a problem, acceptance criteria and a way to verify it; the manager asks only when it truly cannot write one |
| **Run agents in parallel** | `agents.concurrency` slots, one git worktree and branch `sm/<task-id>` each, so they never step on each other |
| **Queue the rest** | `s` on a task starts it, or queues it when every slot is busy — queued tasks start by themselves, in order, and say so on the page |
| **Mix tools** | `claude` or `codex` per project or per task, with the model and effort you want (`opus` + `max`, `gpt-6-astra` + `xhigh`) |
| **Approve from anywhere** | the plan waiting in your terminal is the same one on your phone |
| **Land the work** | the agent asks "commit and merge `sm/T-005` into `main`?" — say yes and it commits, merges, closes the task and its session |
| **Survive conflicts** | a clash creates a P0 task describing both sides, and an agent resolves it in the checkout |
| **Keep the history** | the task file holds the plan, what the agent discovered, its progress, and every session that worked on it — transcripts included |
| **Free the disk** | worktrees are deleted when their task is done (`supermanager clean` sweeps the rest) |
| **Sort your work** | labels and a scheduled date on every task, filterable — plus any field you define |
| **Share the backlog** | task files are plain Markdown in git; a teammate clones and sees the same roadmap |

---

## The task file

One Markdown file per task, in git (`.supermanager/tasks/T-005.md`). A person and an agent read the same thing:

```markdown
---
id: "T-005"  title: "Fix the BOM in the CSV import"  priority: "P0"
fields: {"labels": ["import", "bug"], "scheduled": "2026-W38"}
sessions: [{"tool": "claude", "model": "opus", "session_id": "…", "branch": "sm/T-005", …}]
---
## Problem             what is wrong, where, how it shows
## Expected outcome    what "done" looks like
## Acceptance criteria a list you can check off
## Verification        the command that proves it
## Context             files, constraints — the agent appends what it learns
## Plan                written by the agent once you approve it
## Progress            timestamped notes
## Result              summary + the evidence per criterion
```

**Labels and a date** come as standard. Add your own fields in `config.toml`:

```toml
[[tasks.fields]]
name = "component"
type = "text"        # text | list | date | number
column = "Part"      # shows as a column on the tasks page
```

Filter them: `supermanager tasks --label import`, `--field scheduled --value 2026-W38`, or just type in `ctrl+w`.

---

## Keys

**Anywhere:** `ctrl+a` or `←` `→` next page · `ctrl+w` search · `q` leave (everything keeps running) ·
`ctrl+c` `ctrl+c` quit everything.

**tasks:** `enter` open agent · `i` edit file · `n` new · `s` start · `p` pause · `d` done · `x` delete ·
`X` stop agent · `r` requeue · `h` show finished · `v` board/table · `g` group by · `G` headings ·
`J`/`K` reorder · `+`/`-` concurrency · `m` manager · `?` all keys.

**board:** arrows select · `shift+←/→` move the task to another column · `shift+↑/↓` move it in the backlog.

**agents:** `enter` open · `i` task file · `n` new free agent · `x` stop.

## Commands

| command | what it does |
| --- | --- |
| `supermanager` | start everything, open the manager chat |
| `supermanager -d` · `--no-attach` | open the tasks page instead · stay in your shell |
| `supermanager status` · `tasks` · `show T-001` · `events` | read state, no daemon needed |
| `supermanager tasks --label api --field scheduled --value 2026-W` | filter the backlog |
| `supermanager add` · `start T-001` · `spawn [T-001]` · `stop T-001` | write or dispatch tasks by hand |
| `supermanager attach [manager\|T-001]` | open a session's window in this terminal |
| `supermanager clean [--force]` | delete the worktrees of finished tasks |
| `supermanager config set agents.concurrency 10` · `config show` · `config keys` | settings |
| `supermanager upgrade [--check]` | update supermanager itself to the newest release |
| `supermanager up --headless` | daemon only, no tmux, no pages |

---

## Settings

`.supermanager/config.toml` is the project's — commit it. `.supermanager/config.local.toml` is yours alone
(gitignored) and overrides single keys: your editor, your models, a smaller concurrency on a laptop. The config
page marks what your local file overrides.

| key | default | meaning |
| --- | --- | --- |
| `agents.concurrency` | 3 | how many agents may run at once |
| `agents.tool` | claude | `claude` or `codex`; a task can say otherwise |
| `agents.model` · `agents.effort` | "" | e.g. `opus` + `max`, or `gpt-6-astra` + `xhigh` (same for `manager.*`) |
| `agents.worktrees` | true | one git worktree + branch per agent |
| `agents.worktree_base` | HEAD | what new branches start from |
| `agents.merge_into` | "" | branch an agent merges into when you approve ("" = the branch the project is on) |
| `agents.clean_worktrees` | true | delete a task's worktree once it is done; the branch keeps the work |
| `agents.keep_transcripts` | true | copy a session's transcript into `.supermanager/agents/<id>/transcripts/` |
| `agents.close_done_after` | 20 | seconds before a finished agent's session closes |
| `agents.auto_dispatch` | false | start the next backlog task by itself when a slot frees |
| `agents.auto_trust` | true | answer "do you trust this folder?" for new worktrees |
| `agents.allow_skip_permissions` | true | offer "bypass permissions" when approving a plan |
| `agents.extra_args` · `agents.codex_extra_args` | [] | appended to every `claude` · `codex` command line |
| `manager.autostart` | true | start the manager with the workspace |
| `manager.can_edit_files` | false | off: the manager can only plan and dispatch |
| `manager.exit_closes_all` | true | closing the manager chat stops everything |
| `manager.resume` | true | restart the manager with its previous conversation |
| `tasks.path` | .supermanager/tasks | where the task files live |
| `tasks.in_git` | true | commit the task files, so the backlog is shared |
| `tasks.hide_done` | true | finished tasks start hidden (`h` shows them) |
| `tasks.fields` | labels, scheduled | the extra fields a task carries |
| `tasks.view` | table | how the tasks page opens: `table` or `board` (`v` switches) |
| `tasks.group_by` | status | what it groups by: `status` or a field name (`g` cycles) |
| `tasks.group_rows` | true | headings per group in the table (`G` turns them off) |
| `tasks.editor` | idea | what opens a task file (`idea`, `code`, `vim`…) |
| `tasks.min_problem_chars` · `tasks.require_verification` | 60 · true | how strict the task check is |
| `notify.bell` | true | ring the terminal bell when a session needs you |

## Files

```
.supermanager/
  config.toml         settings — commit this
  config.local.toml   your overrides — gitignored
  SKILL.md            what this folder is; written on init
  tasks/T-001.md      one file per task + _index.json (the order) — commit these
  state.json          sessions and events (local)
  agents/T-001/       what the session was started with, and its transcripts (local)
  worktrees/T-001/    the agent's checkout (local, deleted when the task finishes)
```

## How the pieces talk

- Sessions load `supermanager mcp --role manager|agent` as an MCP server; every tool call goes to the daemon over
  a Unix socket. Lifecycle hooks (`Stop`, `SessionEnd`, `UserPromptSubmit`, `Notification`, plan approval) call
  `supermanager hook <event>`. That is what drives status, the bell and the session records.
- Nothing generated names your machine: the hook and MCP commands find the project from the session's
  environment, or from git when a worktree is all they have.
- Codex gets the same treatment through `-c` overrides and `.codex/hooks.json`. It has no plan mode, so a Codex
  agent calls `plan_approved` once you say yes.
- A session that ends its turn with a background shell or monitor still running is not waiting for you:
  supermanager reads its status line, stays quiet, and looks again a few seconds later.
- The daemon talks to the manager by typing a `[supermanager] …` line into its window.

**Task status flow:** `backlog → queued → planning → working → done`, where `queued` means you asked for it and
it starts as soon as a slot frees. Side exits: `blocked` (needs you),
`interrupted` (the session ended early; `spawn_agent` resumes it with its worktree and conversation) and
`cancelled`.

## Updating a running workspace

The daemon and the pages are long-lived processes, so they keep the code they started with:

```sh
pkill -9 -f "supermanager dashboard -C $PWD"        # -9: a plain kill would stop the agents too
pkill    -f "supermanager (agents-page|config-page) -C $PWD"
supermanager up                                     # the pages come back, the agents kept running
```
