# Settings, files and how it works

Open this when you want to change how supermanager behaves, or to know what it writes where.

## Where settings live

`.supermanager/config.toml` belongs to the project — commit it.
`.supermanager/config.local.toml` is yours alone (gitignored) and overrides single keys: your editor, your
models, fewer agents on a laptop. The config page shows both and marks what your local file overrides.

The page is one tab per section — `tab` and `shift+tab`, or a click on the name. A switch flips with `enter`;
a setting whose values are a set (the tool, an effort, the view, what tasks are grouped by) lists them and
steps through them with `←` `→`; anything else opens a line to type in. `ctrl+w` searches every section at once.

`supermanager config set agents.concurrency 5` · `config show` · `config keys`.

Any of the three — the page, the command, your own editor on the file — is the same change: the other pages
follow within a second. `v`, `g`, `G` and `h` on the tasks page change the view for that session only.

| key | default | meaning |
| --- | --- | --- |
| `agents.concurrency` | 3 | how many agents may run at once |
| `agents.tool` | claude | `claude` or `codex`; a task can say otherwise |
| `agents.plan_model` | opus | model of the planning agent — the one that reads the code and writes the plan |
| `agents.work_model` | opus | model of the agent that does the work, once there is a plan |
| `agents.model` · `agents.effort` | "" | the model for everything the two above do not cover (a session with no task, every codex session) and the effort, e.g. `gpt-6-astra` + `xhigh` (same for `manager.*`) |
| `agents.workdir` | worktree | where an agent works: `worktree` (its own copy of the repo, branch `sm/<task-id>`) or `project` (the project folder itself, on the branch you are on — nothing to merge) |
| `agents.group_agent` | true | tasks that share a `group` go to one agent, in one copy of the repo, on one branch `sm/<group>` |
| `agents.group_settle` | 60 | seconds a new group waits before starting itself, so all its tasks can be written first |
| `agents.worktree_base` | HEAD | what new branches start from |
| `agents.merge_into` | "" | what a finished task merges into ("" = the branch you are on) |
| `agents.clean_worktrees` | true | delete a task's copy of the repo once it is finished; the branch keeps the work |
| `agents.keep_transcripts` | true | copy each session's transcript into `.supermanager/agents/<id>/transcripts/` |
| `agents.reload_supermanager` | true | restart this workspace when a task changed supermanager itself |
| `agents.planning` | planner | how much planning a task gets before it is worked: `planner` (a planning agent first), `agent` (one agent that plans in plan mode and waits for your approval) or `off` (no planning step — the agent starts the work directly). A task can say otherwise |
| `agents.on_finish` | merge | what a finished task does: `merge`, `ask` or `notify` |
| `agents.close_done_after` | 20 | seconds before a finished agent's session closes |
| `agents.budget_tokens` | 0 | tokens one task may spend over all its sessions (0 = no ceiling) |
| `agents.budget_usd` | 0 | ...or what it may cost in dollars (0 = no ceiling); the first one reached ends it |
| `agents.on_budget` | notify | when a task reaches its budget: `notify`, `pause` (Esc) or `stop` (kill its agent) |
| `agents.auto_trust` | true | answer "do you trust this folder?" for new worktrees |
| `agents.skip_permissions` | true | agents run with every permission granted — nothing stops to ask |
| `agents.allow_skip_permissions` | true | when they do ask, offer "bypass permissions" in the prompt |
| `agents.extra_args` · `agents.codex_extra_args` | [] | appended to every `claude` · `codex` command line |
| `auto.everything` | false | one switch for a hands-off run: both below count as on, and finished work is merged |
| `auto.dispatch` | false | start the next backlog task by itself when a slot frees |
| `auto.plan` | false | agents do not wait for you to approve their plan |
| `remote.enabled` | true | run `claude remote-control`, so you can start a session in this project from your phone |
| `remote.name` | {project} | what the project is called in claude.ai/code and in the app |
| `remote.spawn` | worktree | where a session you start from the app runs: `worktree`, `same-dir` or `session` |
| `remote.capacity` | 8 | how many of those may run at once |
| `remote.adopt` | true | show every Claude session started in this project on the agents page |
| `power.keep_awake` | true | keep this computer awake while supermanager runs |
| `power.awake_when_closed` | true | keep working with the laptop lid shut (macOS needs a sudo rule, below) |
| `power.wake_with` | keyboard | what brings the screen back once it is out: `keyboard`, or `anything` (the mouse too) |
| `power.mouse_grace` | 10 | with `anything`: seconds the mouse is ignored first, so it is not woken by mistake |
| `manager.autostart` | true | start the manager with the workspace |
| `manager.can_edit_files` | false | off: the manager only plans and dispatches, it never edits |
| `manager.exit_closes_all` | true | closing the manager chat stops everything |
| `manager.resume` | true | restart the manager with its previous conversation |
| `tasks.path` | .supermanager/tasks | where the task files live |
| `tasks.in_git` | true | commit the task files, so the backlog is shared |
| `tasks.hide_done` | true | finished tasks start collapsed (`h` shows them) |
| `tasks.view` | table | how the tasks page shows them: `table` (a list) or `board` (a kanban) — `list` and `kanban` work too |
| `tasks.group_by` · `tasks.group_rows` | status · true | what it groups by, and whether the table shows the headings |
| `tasks.fields` | labels, scheduled | the extra fields a task carries |
| `tasks.editor` | idea | what opens a task file (`idea`, `code`, `vim`…) |
| `tasks.min_problem_chars` · `tasks.require_verification` | 60 · true | how strict the check on a new task is |
| `notify.bell` | true | ring the terminal when a session needs you |
| `notify.quiet_screen_off` | true | ...but not while the screen is off |

## How a task gets planned

Say what you want. The manager writes the task and **a planner starts on it straight away** — a session of its
own that reads your code, asks you what it cannot answer from the code, and writes the plan onto the task.
It cannot change anything: no worktree, no editing tools.

```
you say it  →  task written  →  planner reads the code, asks you  →  plan on the task
            →  you say start  →  agent implements the plan in its own worktree  →  you approve the merge
```

- **It asks with the ask tool**, so the question reaches you wherever you are — the terminal or the Claude app
  on your phone — with options to pick from, not a sentence to type an answer to. Each answer is kept in the
  task's "Asked for" log, word for word.
- **It goes deeper than the task says.** If the task describes a symptom, the planner finds where the symptom
  comes from before planning a fix, and sharpens the task itself: a clearer problem, criteria that can be
  checked, a verification command that exists in this project.
- **You get the plan twice**: on the task, where it stays, and in the chat, where you actually read it. The
  chat version is written for a phone — what it found, the numbered steps, the files it touches, what it
  assumed — in short lines you can take in at a glance. That happens even when nobody is asked, so a project
  running on auto still tells you what it decided.
- **The last question is yours**: start the work, change the plan, or leave it in the backlog. A plan left in
  the backlog never starts on its own — it waits, with the plan on it, until you say go.
- The agent that does the work is a **fresh session** with that plan. It does not re-plan; if the code turns out
  not to match the plan, it says so and updates it.
- `agents.planning = agent` goes back to one agent that plans and works in plan mode.
- `agents.planning = off` drops the planning step altogether: the agent reads what it needs and gets straight
  to work. The manager still writes the task as usual — and when one looks genuinely big or risky (many files,
  the approach itself an open question, something hard to undo), it asks you first whether to plan that one
  anyway. Say yes and that task alone gets a planner; say no and it starts.
- Either way one task can differ: `planning` on a task is `planner`, `agent`, `off`, or empty to follow the
  project. Ask the manager ("plan this one first", "just do this one") and it sets it.

## One feature, several tasks, one agent

A request is often one feature with several steps. Split it into tasks as usual and give them all the same
**`group`** — a short name for the feature. Then:

- They are worked by **one agent, in one copy of the repo, on one branch `sm/<group>`**, in backlog order.
  The agent completes each task as it finishes it; the branch merges when the **last** one is done.
- The whole group takes **one slot**, however many tasks it holds.
- Nothing starts while the group is still being written (`agents.group_settle`, 60s from the newest task), so
  the tasks go to one agent together instead of the first one running off alone. Starting one by hand says the
  group is complete and starts it now.
- A task added to a group later waits for the group's current session to end, then rides with the next one.
  It never gets a second agent by itself — two agents in one worktree edit the same files.
- `agents.group_agent = false` keeps the shared worktree and branch but gives each task its own agent. That is
  how you deliberately put **two agents in one worktree**; starting one by hand while the group runs does the
  same, and supermanager says so in the events.

Use a group whenever the steps touch the same files or build on each other. Leave `group` empty for tasks that
are genuinely independent: those get an agent and a branch each, and run side by side.

## Working straight in the project

`agents.workdir = project` (or `workdir = "project"` on one task) puts the agent in the project folder itself,
on the branch you are on — no copy of the repo, no `sm/` branch, nothing to merge at the end. Use it for a
project you would rather keep on main, or for work that cannot happen in a copy (resolving a merge, cutting a
release). Agents then see each other's edits, so run few of them, or one.

## When a task finishes

The agent has one call to make: `complete_task`. It reports what it did and what it checked; **supermanager
decides what happens next**, from `agents.on_finish`:

| | |
| --- | --- |
| `merge` (default) | commit what is left on `sm/<task-id>`, merge it into the working branch, delete the copy of the repo, close the session. Nobody is asked |
| `ask` | the agent puts the question to you first and passes your answer on; yes merges, no leaves the branch |
| `notify` | nothing is ever merged: you are told what is ready and on which branch, and you merge when you like |

A conflict is not a failure: whatever the mode, a merge that clashes leaves both branches untouched and becomes
its own P0 task for an agent to resolve. A task's `autonomy` still wins — `auto` always merges, `ask` always
asks — and `auto.everything` merges too.

## How much runs without you

Out of the box, nothing: you approve every plan and every merge, and work starts when you ask for it. The
`auto` section hands those steps over one at a time. `auto.everything` is the same thing in one switch — turn
it on and both count as on (and finished work is merged); turn it off and you have every decision back.

| switch | what stops asking you |
| --- | --- |
| `auto.dispatch` | when a slot frees, the top of the backlog starts by itself. The order of the backlog is what runs next, so keep it right |
| `auto.plan` | an agent explores, writes its plan onto the task, and implements it. You still see the plan on the task page, and it still stops with `blocked` if it hits a real question |

`auto.plan` changes what an agent is launched with: plan mode when it still has to plan, `acceptEdits` once its
plan is approved — and neither, when permissions are skipped (see below).

The manager knows which of these are on and says so instead of promising you a question that will not come.
Change them on the config page, with `supermanager config set auto.plan true`, or by asking the manager.

## Permissions

**Agents run with every permission granted** (`agents.skip_permissions`, on). No prompt for an edit, a command
or a tool: `--dangerously-skip-permissions` for Claude, `--dangerously-bypass-approvals-and-sandbox` for Codex —
the bypass, not a narrower sandbox, so nothing an agent needs can be refused either. An agent that
stops to ask is an agent that sits there until someone comes back, which is the opposite of the point — and
each one works in its own copy of the repo on its own branch.

supermanager's own tools are allowed explicitly on top of that (`mcp__supermanager`, both on the command line
and in the session's settings file), so talking to supermanager never needs a yes even if you switch the rest
off. Planners are the exception that proves it: they run with permissions skipped *and* every editing tool
disallowed, so they can read anything and change nothing.

Switch `agents.skip_permissions` off and agents ask again, with "bypass permissions" offered in the prompt
(`agents.allow_skip_permissions`). A task with `autonomy = auto` always skips, whatever the project says.

**One task at a time.** A task's own `autonomy` beats all of this: `auto` means that task decides everything
itself (it plans, works and merges without asking), `ask` means it always asks even when the project runs on
auto, empty means follow the project. Tell the manager "just do this one yourself" and it sets it.

**Settings that moved.** `agents.auto_dispatch` became `auto.dispatch`, `auto.merge` became `agents.on_finish`,
and `auto.permissions` became `agents.skip_permissions`. Old config files and `supermanager config set` still
take the old names; the file is rewritten with the new ones the next time a setting is saved.

## Walking away from it

`power.keep_awake` (on) holds the computer awake for as long as supermanager runs, so the agents keep working
while you are not there — `caffeinate -i -m -s` on macOS, systemd's inhibitor on Linux. It says nothing about
the screen, which may still go black by itself.

To black the screen on purpose, tell the manager ("turn the screen off", "lights out", "I'm going to bed") and
it calls `screen_off`; `supermanager screen-off` does the same from any shell. Nothing stops: the machine is
awake and the agents carry on. The manager never does it unless you ask.

**Shutting the lid** (`power.awake_when_closed`, on) does not stop it either — close the laptop, walk off,
the agents carry on.

On Linux that comes free: the same inhibitor holds the lid switch. On macOS it does not. A shut lid sleeps
whatever `caffeinate` says; the only thing that holds it is the machine-wide `pmset disablesleep`, and that
needs root. supermanager will set it if `sudo` needs no password, put it back when it stops, and — because
the setting survives a reboot — put it back on its next run if it was killed before it could. It never
touches a lid *you* set to stay awake.

Without a password-free rule it says so once and tells you the command:

```sh
sudo pmset -a disablesleep 1     # stay awake with the lid shut
sudo pmset -a disablesleep 0     # back to normal
pmset -g | grep SleepDisabled    # which one is in force
```

To let supermanager do it itself, add the rule (`sudo visudo -f /etc/sudoers.d/supermanager`):

```
%admin ALL=(root) NOPASSWD: /usr/bin/pmset -a disablesleep 1, /usr/bin/pmset -a disablesleep 0
```

A laptop that is shut and awake is a laptop making heat with nowhere to put it. Fine on a desk, not in a bag.

**What brings it back is `power.wake_with`** (macOS only). On `keyboard`, the default, only a key press does:
supermanager keeps watching, and a display woken by anything else — a nudged desk, a cat on the trackpad — is
put straight back out. On `anything` a mouse move counts too, but not for the first `power.mouse_grace`
seconds (10), so the hand you are still moving off the trackpad does not undo what you just asked for. A key
press always works from the first second. Elsewhere (Linux) nothing is told apart, so the display is left to
do whatever it does.

How it knows: macOS's `UserIsActive` power assertion says whether the display is on, and CoreGraphics
(`CGEventSourceSecondsSinceLastEventType`) says how long ago a *key* was last pressed, as against anything at
all. A key pressed after the screen went dark is a real wake; nothing else is. See `power.py`.

**The bell goes quiet with the screen** (`notify.quiet_screen_off`), so nothing beeps in a dark room. Nothing is
lost: whatever needs you is still on the agents page with its 🔔, and the bell comes back the moment you do —
when the screen is really back, and whenever you touch supermanager itself. It says in one line what was
waiting while it was quiet.

## From your phone

supermanager runs `claude remote-control` for the project (`remote.enabled`), so the project shows up in
claude.ai/code and in the Claude app under `remote.name`. Start a session there and it works in this project —
in its own copy of the repo by default (`remote.spawn = worktree`), like an agent.

Those sessions are yours, not supermanager's: they never take a slot from the backlog. But they **show up on
the agents page** next to everything else, with what they are doing and a 🔔 when they want you
(`remote.adopt`). That works by putting supermanager's lifecycle hooks in `.claude/settings.local.json` — your
own per-project settings file, never committed — so any Claude session started in this project reports in,
including one you start by hand in a terminal. The row says where it lives — 📱 the Claude app, 💻 a
terminal and which one — and goes away when that session ends. Switch `remote.adopt` off and the hooks
are taken back out.

There is no local window for such a session, so the agents page cannot open one, and the manager cannot read
its screen or type into it.

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
  tasks/T-001.md      one file per task + _index.json (the order) — commit these; edit, add or delete
                      them by hand and the tasks page follows within a second
  state.json          sessions and events (local)
  agents/T-001/       what each session was started with, and its transcripts (local)
  agents/T-001/plan/  the same for that task's planner
  worktrees/T-001/    the agent's copy of the repo (local, deleted when the task finishes)
  logs/               what the restart helper wrote, if anything went wrong

.claude/settings.local.json   the hooks that put your own sessions on the agents page (remote.adopt)
```

## Tokens and money

Every session writes the token count of each request into its own transcript. supermanager reads the new lines
of that file whenever the session reports in — so nothing is estimated, and nothing is asked of a network.

- **Per session**, on the agents page's `Cost` column. **Per task**, over every session that ever worked on it:
  the `Cost` column on the tasks page, the `Spent` line in `supermanager show T-001`, and the task file itself.
- **For the whole project**: `supermanager spend`, or ask the manager (*"how much has this cost?"*).
- **Prices** are US dollars per million tokens, from `usage.py`. A model it does not know is counted but not
  priced, and every total that contains one is marked `~`. Set your own under `[prices]` in `config.toml`:

  ```toml
  [prices]
  "gpt-6-astra" = [1.25, 10.0, 0.0, 0.0, 0.125]   # input, output, cache write 5m / 1h, cache read
  ```

**Budgets.** `agents.budget_tokens` and `agents.budget_usd` cap what *one task* may spend over all its
sessions; a task can carry its own pair instead (the manager sets them, or edit the task file). Whichever
ceiling is reached first counts, and `agents.on_budget` says what happens then: `notify` (you are told, the
agent carries on), `pause` (Esc in its session — the work and the conversation stay) or `stop` (its agent is
killed, the task becomes interrupted, its branch is kept). You are told either way, and the task's `Cost` goes
amber at four fifths of the budget and red when it is out. Raise the budget and the task may spend again.

## What the manager can do about a running agent

Ask it in plain words and it uses these, in the user's name only:

- *"what is T-003 doing?"* → it reads that session's screen.
- *"tell T-003 to skip the migration"* → it types your words into that agent's chat and reports the answer.
  The line also lands in the task's "Asked for" log, so the task keeps the instruction.
- *"which agent mentioned the timeout?"* → it searches every running session's screen and every saved
  transcript, and says where each hit came from.
- *"pause T-003"* · *"tell it to carry on"* · *"stop everything"* → it pauses, resumes and kills agents, one or
  all of them. A pause keeps the work; a stop leaves the task interrupted with its branch.
- *"how much has this cost?"* · *"keep this one under a dollar"* → it reads the spend and sets budgets.

It never messages or steers an agent on its own: if it thinks one needs redirecting, it tells you and waits.

**When what you ask for touches work already running**, it does not decide for you either. Before writing the
task it looks at what is open, reads that session's screen, and asks: *tell T-003, or a new task?* Telling
T-003 sends your words to the agent that is already in those files — usually what you want for a correction
or an "also make it..."; a new task is for work that stands on its own. If nothing is running on it, it simply
writes the task and says so.

## How the pieces talk

- One tmux workspace per project, on supermanager's own tmux server, so your tmux config is untouched.
- A daemon holds the backlog and the slots. The manager and the agents reach it through MCP tools; lifecycle
  hooks (`Stop`, `SessionEnd`, `UserPromptSubmit`, notifications, plan approval) tell it when a plan was
  approved, when a session went quiet and when one needs you. That is what drives the bell and the task file.
- Nothing generated names your machine: the hook and MCP commands find the project from the session's
  environment, or from git when a worktree is all they have.
- Codex gets the same treatment through `-c` overrides and `.codex/hooks.json`. It has no plan mode and no ask
  tool, so a Codex planner asks in the chat.
- Every window supermanager opens says what it is (`SUPERMANAGER_ROLE`), and a window's environment is
  inherited by what it starts — which is how the sessions the Remote Control server spawns are recognised as
  yours rather than mistaken for the manager.
- A session that ends its turn with a shell or a monitor still running is not waiting for you: supermanager
  reads its status line, stays quiet, and looks again a few seconds later.
- What an agent has to say to the manager (a task done, blocked, merged) is **typed into the manager's chat,
  and never into a line you are writing**. While your own message sits half-typed in its box — or a dialog is
  up — the news waits in a queue, and everything that piled up arrives as one message the moment you send what
  you were writing. Nothing is lost while it waits: it is on the events page, in `get_events`, and in the
  kickoff of the next manager that starts.

**Task flow:** `backlog → planning (a planner) → backlog or queued → working → done`, with `blocked` (needs
you), `interrupted` (the
session ended early; starting it again picks up where it left off) and `cancelled` on the side.

## When you change supermanager's code

A running workspace keeps the code it started with. supermanager restarts itself after a task that changed it;
otherwise, from the project:

```sh
pkill -9 -f "supermanager dashboard -C $PWD"        # -9 keeps the agents alive
pkill    -f "supermanager (agents-page|config-page) -C $PWD"
supermanager up
```
