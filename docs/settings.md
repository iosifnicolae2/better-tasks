# Settings, files and how it works

Open this when you want to change how supermanager behaves, or to know what it writes where.

## Where settings live

`.supermanager/config.toml` belongs to the project — commit it.
`.supermanager/config.local.toml` is yours alone (gitignored) and overrides single keys: your editor, your
models, fewer agents on a laptop. The config page shows both and marks what your local file overrides.

`supermanager config set agents.concurrency 5` · `config show` · `config keys`.

| key | default | meaning |
| --- | --- | --- |
| `agents.concurrency` | 3 | how many agents may run at once |
| `agents.tool` | claude | `claude` or `codex`; a task can say otherwise |
| `agents.model` · `agents.effort` | "" | e.g. `opus` + `max`, or `gpt-6-astra` + `xhigh` (same for `manager.*`) |
| `agents.worktrees` | true | give each agent its own copy of the repo and a branch `sm/<task-id>` |
| `agents.worktree_base` | HEAD | what new branches start from |
| `agents.merge_into` | "" | what an agent merges into when you approve ("" = the branch you are on) |
| `agents.clean_worktrees` | true | delete a task's copy of the repo once it is finished; the branch keeps the work |
| `agents.keep_transcripts` | true | copy each session's transcript into `.supermanager/agents/<id>/transcripts/` |
| `agents.reload_supermanager` | true | restart this workspace when a task changed supermanager itself |
| `agents.close_done_after` | 20 | seconds before a finished agent's session closes |
| `agents.auto_dispatch` | false | start the next backlog task by itself when a slot frees |
| `agents.auto_trust` | true | answer "do you trust this folder?" for new worktrees |
| `agents.allow_skip_permissions` | true | offer "bypass permissions" when approving a plan |
| `agents.extra_args` · `agents.codex_extra_args` | [] | appended to every `claude` · `codex` command line |
| `manager.autostart` | true | start the manager with the workspace |
| `manager.can_edit_files` | false | off: the manager only plans and dispatches, it never edits |
| `manager.exit_closes_all` | true | closing the manager chat stops everything |
| `manager.resume` | true | restart the manager with its previous conversation |
| `tasks.path` | .supermanager/tasks | where the task files live |
| `tasks.in_git` | true | commit the task files, so the backlog is shared |
| `tasks.hide_done` | true | finished tasks start collapsed (`h` shows them) |
| `tasks.view` · `tasks.group_by` · `tasks.group_rows` | table · status · true | how the tasks page opens |
| `tasks.fields` | labels, scheduled | the extra fields a task carries |
| `tasks.editor` | idea | what opens a task file (`idea`, `code`, `vim`…) |
| `tasks.min_problem_chars` · `tasks.require_verification` | 60 · true | how strict the check on a new task is |
| `notify.bell` | true | ring the terminal when a session needs you |

## Fields of your own

Tasks carry labels and a scheduled date out of the box. Add more:

```toml
[[tasks.fields]]
name = "component"
type = "text"        # text | list | date | number
column = "Part"      # give it a column on the tasks page; leave it out to keep it off the table
width = 14
help = "Which part of the system this touches."
```

The manager fills them when you mention one. Filter with `supermanager tasks --label api`,
`--field scheduled --value 2026-W38`, or by typing in `ctrl+w` on the page.

## What it writes

```
.supermanager/
  config.toml         settings — commit this
  config.local.toml   your overrides — gitignored
  SKILL.md            what this folder is; written on the first run
  tasks/T-001.md      one file per task + _index.json (the order) — commit these
  state.json          sessions and events (local)
  agents/T-001/       what each session was started with, and its transcripts (local)
  worktrees/T-001/    the agent's copy of the repo (local, deleted when the task finishes)
  logs/               what the restart helper wrote, if anything went wrong
```

## How the pieces talk

- One tmux workspace per project, on supermanager's own tmux server, so your tmux config is untouched.
- A daemon holds the backlog and the slots. The manager and the agents reach it through MCP tools; lifecycle
  hooks (`Stop`, `SessionEnd`, `UserPromptSubmit`, notifications, plan approval) tell it when a plan was
  approved, when a session went quiet and when one needs you. That is what drives the bell and the task file.
- Nothing generated names your machine: the hook and MCP commands find the project from the session's
  environment, or from git when a worktree is all they have.
- Codex gets the same treatment through `-c` overrides and `.codex/hooks.json`. It has no plan mode, so a Codex
  agent calls `plan_approved` once you say yes.
- A session that ends its turn with a shell or a monitor still running is not waiting for you: supermanager
  reads its status line, stays quiet, and looks again a few seconds later.

**Task flow:** `backlog → queued → planning → working → done`, with `blocked` (needs you), `interrupted` (the
session ended early; starting it again picks up where it left off) and `cancelled` on the side.

## When you change supermanager's code

A running workspace keeps the code it started with. supermanager restarts itself after a task that changed it;
otherwise, from the project:

```sh
pkill -9 -f "supermanager dashboard -C $PWD"        # -9 keeps the agents alive
pkill    -f "supermanager (agents-page|config-page) -C $PWD"
supermanager up
```
