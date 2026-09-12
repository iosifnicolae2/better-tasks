# supermanager

**Run a team of coding agents on one project, from one terminal — or from your phone.**

You say what you want, in plain words. A manager Claude turns it into a task with a way to check it, and puts an
agent on it in its own copy of the repo. You approve the plan, the agent works, asks whether to merge, and tidies
up after itself. Agents run on **Claude Code** or **OpenAI Codex** — your pick, per project or per task.

<img src="docs/screenshots/tasks.svg" alt="The tasks page: a grouped table of the backlog" width="100%">

---

## Install

```sh
git clone https://github.com/bringes/supermanager
cd supermanager
make install
```

That installs `uv` and `tmux` if they are missing and links the `supermanager` command (short: `sm`) to this
folder. Then, in any project:

```sh
cd your-project
supermanager
```

The first run makes a `.supermanager/` folder and drops you into the manager chat. Tell it what you want:

> *"The CSV import drops rows with a BOM. Fix it and add a test."*

It writes the task, starts an agent, and tells you the id. The agent explores the code, shows you a plan, and
waits for your yes — in this terminal, at claude.ai, or on your phone.

You need `claude` and/or `codex` on your PATH, and git.

---

## What you look at

Everything lives in one tmux workspace: the manager chat, one window per agent, and three pages.
**`ctrl+a`** (or `←` `→`) moves between them. Every other key belongs to whatever you are looking at.

### tasks — your roadmap

Grouped by status, running agents first. `enter` opens the agent working on a task, `s` starts one (or queues it
when all the slots are busy), `n` writes a new task, `ctrl+w` searches, and a click on a column title sorts by it.

<img src="docs/screenshots/tasks.svg" alt="The tasks table" width="100%">

Press `v` and the same tasks become a board. Arrows move the selection; **shift+←/→ move the task** — starting
it, closing it, or putting it back — and `g` regroups the columns by label, by date, or by any field you add.

<img src="docs/screenshots/board.svg" alt="The board view: one column per status, cards you move with the keyboard" width="100%">

### agents — what is running right now

One row per session, with the task it works on, how far that task is, and a 🔔 when it needs you. Every notice
appears here — plan ready, blocked, finished — so the roadmap stays quiet.

<img src="docs/screenshots/agents.svg" alt="The agents page" width="100%">

### config — every setting, saved as you change it

<img src="docs/screenshots/config.svg" alt="The config page" width="100%">

---

## What you can do with it

| | |
| --- | --- |
| **Talk, don't file tickets** | every request becomes a task with a problem, a list you can check off, and a command that proves it |
| **Run several agents at once** | each gets its own copy of the repo and its own branch, so they never trip over each other |
| **Queue the rest** | ask for more than you have slots for; the extra tasks start by themselves, in order |
| **Mix tools** | Claude Code or Codex, per project or per task, with the model and effort you want |
| **Approve from your phone** | the plan waiting in your terminal is the same one in the Claude app |
| **Land the work** | the agent asks "commit and merge this?" — say yes and it merges, closes the task and shuts its session down |
| **Survive conflicts** | a clash becomes its own urgent task, with both sides described, and an agent resolves it |
| **Keep the story** | each task file holds what you asked for in your own words, the plan, what the agent found, and every session that touched it |
| **Sort your work** | labels and a date on every task, plus any field you want to add |
| **Share it** | the task files are plain Markdown in git: a teammate clones and sees the same roadmap |
| **Change supermanager itself** | ask the manager for a key, a column, a fix — it puts an agent on supermanager's own code, then restarts your workspace with it |

---

## Asking supermanager to change itself

supermanager knows where its own source is. In any project, ask the manager for it in plain words:

> *"On the tasks page, `p` should pause every running agent, not just the selected one."*

It writes the task against supermanager's own checkout, an agent does the work and commits it there, and when
the task is done **your workspace restarts with the new code** — your agents and the manager keep running.

Nothing restarts unless supermanager still starts: that is checked before the task is allowed to finish, and
again just before the restart. If either check fails you stay on the version that works and the agent is handed
the error to fix. If your clone is a public fork of the original, the manager also asks whether to contribute
the change upstream, and opens the pull request only if you say yes.

---

## The task file

One Markdown file per task, in git, readable by you and by the agent:

```markdown
## Problem             what is wrong, where, how it shows
## Expected outcome    what "done" looks like
## Acceptance criteria a list you can check off
## Verification        the command that proves it
## Context             files and constraints — the agent adds what it learns
## Asked for           what you said, word for word, each time you said it
## Plan                written by the agent once you approve it
## Progress            timestamped notes
## Result              a summary and the evidence for each criterion
```

Labels and a scheduled date come as standard. Add fields of your own in `.supermanager/config.toml`:

```toml
[[tasks.fields]]
name = "component"
type = "text"        # text | list | date | number
column = "Part"      # give it a column on the tasks page
```

Filter by them: `supermanager tasks --label import`, `--field scheduled --value 2026-W38`, or type in `ctrl+w`.

---

## Keys

**Anywhere:** `ctrl+a` or `←` `→` next page · `ctrl+w` search · `q` leave (everything keeps running) ·
`ctrl+c` `ctrl+c` stop everything.

**tasks:** `enter` open the agent · `i` edit the file · `n` new · `s` start or queue · `p` pause · `d` done ·
`x` delete · `v` board · `g` group by · `h` show finished · `?` all of them.

**board:** arrows select · `shift+←/→` move the task · `shift+↑/↓` move it up and down the backlog.

**agents:** `enter` open · `i` its task file · `n` a new agent with no task · `x` stop.

## Commands

| command | what it does |
| --- | --- |
| `supermanager` | start everything and open the manager chat |
| `supermanager status` · `tasks` · `show T-001` · `events` | read what is going on, from any shell |
| `supermanager tasks --label api` | filter the backlog |
| `supermanager spawn T-001` · `stop T-001` | start or stop an agent yourself |
| `supermanager attach T-001` | open a session's window here |
| `supermanager clean` | delete the copies of the repo left by finished tasks |
| `supermanager config set agents.concurrency 5` | change a setting |
| `supermanager upgrade` | update supermanager itself |

---

## Settings

`.supermanager/config.toml` belongs to the project — commit it. `.supermanager/config.local.toml` is yours alone
and overrides single keys: your editor, your models, fewer agents on a laptop. The config page shows both.

| key | default | meaning |
| --- | --- | --- |
| `agents.concurrency` | 3 | how many agents may run at once |
| `agents.tool` | claude | `claude` or `codex`; a task can say otherwise |
| `agents.model` · `agents.effort` | "" | e.g. `opus` + `max`, or `gpt-6-astra` + `xhigh` (same for `manager.*`) |
| `agents.worktrees` | true | give each agent its own copy of the repo and a branch `sm/<task-id>` |
| `agents.merge_into` | "" | what an agent merges into when you approve ("" = the branch you are on) |
| `agents.clean_worktrees` | true | delete a task's copy of the repo once it is finished; the branch keeps the work |
| `agents.keep_transcripts` | true | keep each session's transcript with the project |
| `agents.reload_supermanager` | true | restart this workspace when a task changed supermanager itself |
| `agents.auto_dispatch` | false | start the next backlog task by itself when a slot frees |
| `manager.autostart` | true | start the manager with the workspace |
| `manager.can_edit_files` | false | off: the manager only plans and dispatches, it never edits |
| `tasks.in_git` | true | commit the task files, so the backlog is shared |
| `tasks.view` · `tasks.group_by` | table · status | how the tasks page opens |
| `tasks.hide_done` | true | finished tasks start hidden (`h` shows them) |
| `tasks.editor` | idea | what opens a task file (`idea`, `code`, `vim`…) |
| `notify.bell` | true | ring the terminal when a session needs you |

`supermanager config keys` lists every one of them.

## How it hangs together

- One tmux workspace per project, on its own tmux server, so your own tmux is untouched.
- A small daemon holds the backlog and the slots; the manager and the agents reach it through MCP tools, and
  their lifecycle hooks tell it when a plan was approved, a session went quiet, or something needs you.
- Task files, settings and a record of every session are plain files under `.supermanager/`.
- A session that ends its turn with a shell or a monitor still running is not waiting for you: supermanager
  reads its status line, stays quiet, and looks again a few seconds later.

**Task flow:** `backlog → queued → planning → working → done`, with `blocked` (needs you), `interrupted` (its
session ended early; starting it again picks up where it left off) and `cancelled` on the side.

## When you change the code

A running workspace keeps the code it started with. supermanager restarts itself after a task that changed it;
otherwise, from the project:

```sh
pkill -9 -f "supermanager dashboard -C $PWD"        # -9 keeps the agents alive
pkill    -f "supermanager (agents-page|config-page) -C $PWD"
supermanager up
```

The screenshots above are drawn from the real pages — `make screenshots` redraws them.
