"""Project config (.supermanager/config.toml). Open this to see every setting and its default."""

from __future__ import annotations

import tomllib
from dataclasses import asdict, dataclass, field
from dataclasses import fields as dataclasses_fields
from pathlib import Path

import tomli_w

TOOLS = ("claude", "codex")   # what an agent session runs; the manager is always Claude
WORKDIRS = ("worktree", "project")   # where an agent works: its own copy of the repo, or the project itself
SPAWN_MODES = ("same-dir", "worktree", "session")   # where `claude remote-control` puts a session you start
WAKE_WITH = ("keyboard", "anything")   # what brings the screen back after "lights out"
AUTONOMY = ("", "auto", "ask")
# How much planning a task gets before anyone writes code (agents.planning; a task can say otherwise).
PLANNING_MODES = ("planner", "agent", "off")
TASK_PLANNING = ("", *PLANNING_MODES)   # what one task may say; "" = follow the project
# What supermanager does when an agent reports a task finished (agents.on_finish).
FINISH_MODES = ("merge", "ask", "notify")
BUDGET_MODES = ("notify", "pause", "stop")   # what happens when a task has spent what it was allowed   # what one task says about itself: "" = follow [auto], auto = decide everything
LOCAL_NAME = "config.local.toml"   # per-user overrides, never committed
VIEWS = {"table": "table", "list": "table", "board": "board", "kanban": "board"}   # what people call the two views
EFFORT_LEVELS = {
    "claude": ("low", "medium", "high", "xhigh", "max"),
    "codex": ("minimal", "low", "medium", "high", "xhigh"),
}


@dataclass
class ManagerConfig:
    model: str = ""
    effort: str = ""
    autostart: bool = True
    can_edit_files: bool = False
    rc_name: str = "{project}-manager"
    resume: bool = True
    exit_closes_all: bool = True   # closing the manager chat (ctrl+c) shuts supermanager down: agents, page, tmux
    extra_args: list[str] = field(default_factory=list)


@dataclass
class AgentsConfig:
    concurrency: int = 3
    workdir: str = "worktree"     # where an agent works: its own copy of the repo, or the project itself (main)
    group_agent: bool = True      # tasks that share a group are done by one agent, in one copy of the repo
    group_settle: int = 60        # seconds a new group waits before starting itself, so it can be written whole
    worktree_base: str = "HEAD"
    tool: str = "claude"          # claude or codex; a task can override it
    merge_into: str = ""          # branch an agent merges into when you say yes ("" = the branch the project is on)
    clean_worktrees: bool = True  # delete a finished task's worktree; its branch keeps the work
    keep_transcripts: bool = True # copy each finished session's transcript into .supermanager/agents/<id>/
    reload_supermanager: bool = True  # a task that changed supermanager itself restarts this workspace with it
    model: str = ""               # empty = the tool's own default; must be a model of that tool
    plan_model: str = "opus"      # model of the planning agent (a Claude model; empty = agents.model)
    work_model: str = "opus"      # model of the agent that does the work (a Claude model; empty = agents.model)
    effort: str = ""              # claude: low..max, codex: minimal..xhigh; empty = the tool's default
    skip_permissions: bool = True   # agents run with every permission granted: nothing stops to ask
    allow_skip_permissions: bool = True   # when they do not, "bypass permissions" is still offered in a prompt
    planning: str = "planner"    # planner (a planning agent first), agent (one agent, in plan mode), off (straight to work)
    budget_tokens: int = 0       # tokens one task may spend over all its sessions (0 = no ceiling)
    budget_usd: float = 0.0      # ...or what it may cost, in dollars (0 = no ceiling); either one ends it
    on_budget: str = "notify"    # when it runs out: notify (tell you), pause (Esc) or stop (kill the agent)
    on_finish: str = "merge"     # when an agent reports done: merge it, ask the user first, or only tell them
    close_done_after: int = 20   # seconds between an agent reporting done and its session being closed
    auto_trust: bool = True
    rc_name: str = "{project}-{task}"
    extra_args: list[str] = field(default_factory=list)         # appended to every `claude` agent command line
    codex_extra_args: list[str] = field(default_factory=list)   # appended to every `codex` agent command line


@dataclass
class AutoConfig:
    """How much of the loop runs without you. Everything here is off: you approve every plan and every merge.

    `everything` is the single switch for a hands-off run — it turns the four steps below on at once, so you can
    hand the whole loop over and take it back with one toggle."""
    everything: bool = False   # all three steps below, on — and finished work merged (agents.on_finish)
    dispatch: bool = False     # start the top of the backlog by itself whenever a slot frees
    plan: bool = False         # agents do not wait for a plan approval: they plan, record it, and implement

    STEPS = ("dispatch", "plan")

    def on(self, step: str) -> bool:
        """Does this step happen without the user? `everything` answers yes for all of them."""
        return self.everything or bool(getattr(self, step))

    def steps_on(self) -> list[str]:
        return [step for step in self.STEPS if self.on(step)]




DEFAULT_FIELDS = [
    {"name": "labels", "type": "list", "column": "Labels", "width": 22,
     "help": "Free tags: area, kind, whatever you sort your work by."},
    {"name": "scheduled", "type": "date", "column": "When", "width": 12,
     "help": "When you mean to do it: a date (2026-09-20) or a week (2026-W38)."},
    {"name": "repo", "type": "text",
     "help": "Another checkout this task works in (absolute path). No worktree is made; the agent works there."},
    {"name": "conflict_for", "type": "text",
     "help": "Set by supermanager on a task it created to resolve another task's merge conflict."},
]


@dataclass
class FieldSpec:
    """One extra thing a task can carry. Projects add their own in config.toml:

        [[tasks.fields]]
        name = "component"
        type = "text"      # text | list | date | number
        column = "Part"    # a column on the tasks page; leave it out to keep the field off the table
        width = 14
        help = "Which part of the system this touches."
    """
    name: str
    type: str = "text"
    column: str = ""
    width: int = 14
    help: str = ""

    def parse(self, raw):
        """A value as the user typed it (or as an MCP client sent it) turned into what the task stores."""
        if self.type == "list":
            if isinstance(raw, str):
                return [part.strip() for part in raw.replace(",", " ").split() if part.strip()]
            return [str(part).strip() for part in (raw or []) if str(part).strip()]
        if self.type == "number":
            return None if raw in ("", None) else float(raw) if "." in str(raw) else int(raw)
        return str(raw or "").strip()

    def show(self, value) -> str:
        if self.type == "list":
            return " ".join(value or [])
        return "" if value in (None, "") else str(value)


@dataclass
class RemoteConfig:
    """`claude remote-control` for this project: start a session from claude.ai/code or the Claude app on your
    phone, in this project, and see it on the agents page next to supermanager's own agents."""
    enabled: bool = True
    name: str = "{project}"      # what the project is called in claude.ai/code and in the app
    spawn: str = "worktree"      # where a session you start from the app runs: worktree, same-dir or session
    capacity: int = 8            # how many such sessions may run at once
    adopt: bool = True           # any Claude session started in this project reports in and shows on the page


@dataclass
class PowerConfig:
    """The machine itself: awake while agents work, and a screen you can put out when you walk away."""
    keep_awake: bool = True     # hold the computer awake for as long as supermanager runs
    awake_when_closed: bool = True   # keep working with the laptop lid shut (macOS: needs root, see power.py)
    wake_with: str = "keyboard"   # what brings the screen back once it is out: keyboard, or anything
    mouse_grace: int = 10       # with `anything`: seconds the mouse is ignored first, so a stray hand does not wake it


@dataclass
class TasksConfig:
    path: str = ".supermanager/tasks"
    min_problem_chars: int = 60
    require_verification: bool = True
    hide_done: bool = True      # finished tasks (done, cancelled) stay out of the tasks page until you press h
    in_git: bool = True         # the task files are committed with the project, so the backlog is shared
    view: str = "table"         # how the tasks page opens: table or board (v switches, g regroups)
    group_by: str = "status"    # what the tasks are grouped by: status, or one of the fields below
    group_rows: bool = True     # the table shows a heading per group; off = one flat list
    fields: list[dict] = field(default_factory=lambda: [dict(f) for f in DEFAULT_FIELDS])
    editor: str = "idea"        # command that opens a task file for editing (enter on the tasks page), e.g. idea, code, vim


@dataclass
class TmuxConfig:
    session: str = "sm-{project}"


@dataclass
class NotifyConfig:
    bell: bool = True    # ring the terminal bell and mark the window 🔔 when a session waits for you
    quiet_screen_off: bool = True   # ...but not while the screen is off: no bell in a dark room


@dataclass
class Config:
    project_name: str = ""
    manager: ManagerConfig = field(default_factory=ManagerConfig)
    agents: AgentsConfig = field(default_factory=AgentsConfig)
    auto: AutoConfig = field(default_factory=AutoConfig)
    remote: RemoteConfig = field(default_factory=RemoteConfig)
    power: PowerConfig = field(default_factory=PowerConfig)
    tasks: TasksConfig = field(default_factory=TasksConfig)
    tmux: TmuxConfig = field(default_factory=TmuxConfig)
    notify: NotifyConfig = field(default_factory=NotifyConfig)
    # Dollars per million tokens, for models this version does not know or prices differently than you pay:
    #   [prices]
    #   "claude-opus-5" = [5.0, 25.0, 6.25, 10.0, 0.5]   # input, output, cache write 5m / 1h, cache read
    # supermanager's own table (usage.PRICES) covers the rest.
    prices: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["project"] = {"name": d.pop("project_name")}
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Config":
        return cls(
            project_name=d.get("project", {}).get("name", ""),
            manager=_section(ManagerConfig, d.get("manager")),
            agents=_section(AgentsConfig, {**(d.get("agents") or {}), "on_finish": _finish_mode(d),
                                          "skip_permissions": _skip_permissions(d), "workdir": _workdir(d),
                                          "planning": _planning(d)}),
            auto=_auto_section(d),
            remote=_section(RemoteConfig, d.get("remote")),
            power=_section(PowerConfig, d.get("power")),
            tasks=_section(TasksConfig, d.get("tasks")),
            tmux=_section(TmuxConfig, d.get("tmux")),
            notify=_section(NotifyConfig, d.get("notify")),
            prices={str(k): [float(n) for n in v] for k, v in (d.get("prices") or {}).items()},
        )

    def task_fields(self) -> list[FieldSpec]:
        """The extra fields a task can carry, as defined in config.toml (labels and a date by default)."""
        out = []
        for spec in self.tasks.fields or []:
            known = {k: v for k, v in spec.items() if k in {f.name for f in dataclasses_fields(FieldSpec)}}
            if known.get("name"):
                out.append(FieldSpec(**known))
        return out

    def field(self, name: str) -> FieldSpec | None:
        return next((f for f in self.task_fields() if f.name == name), None)

    def fmt(self, template: str, **extra: str) -> str:
        return template.format(project=self.project_name, **extra)

    @property
    def tmux_session(self) -> str:
        return _slug(self.fmt(self.tmux.session))

    def remote_name(self) -> str:
        return self.fmt(self.remote.name)

    def manager_rc_name(self) -> str:
        return self.fmt(self.manager.rc_name)

    def agent_rc_name(self, task_id: str) -> str:
        return self.fmt(self.agents.rc_name, task=task_id)


def _section(kind, values: dict | None):
    """Build one config section, ignoring keys this version does not know (a config written by an older or
    newer supermanager still loads)."""
    fields = {f.name for f in dataclasses_fields(kind)}
    return kind(**{k: v for k, v in (values or {}).items() if k in fields})


def _finish_mode(d: dict) -> str:
    """agents.on_finish, with the short-lived auto.merge switch carried over."""
    agents = d.get("agents") or {}
    if agents.get("on_finish"):
        return str(agents["on_finish"])
    moved = (d.get("auto") or {}).get("merge")
    return "merge" if moved is None or moved else "ask"


def _workdir(d: dict) -> str:
    """agents.workdir, with the older agents.worktrees switch carried over: off meant the project itself."""
    agents = d.get("agents") or {}
    if agents.get("workdir"):
        return str(agents["workdir"])
    return "worktree" if agents.get("worktrees", True) else "project"


def _planning(d: dict) -> str:
    """agents.planning, with the older agents.plan_first switch carried over: true meant a planning agent
    first, false one agent that plans in plan mode."""
    agents = d.get("agents") or {}
    if agents.get("planning"):
        return str(agents["planning"])
    if "plan_first" in agents:
        return "planner" if agents["plan_first"] else "agent"
    return "planner"


def _skip_permissions(d: dict) -> bool:
    """agents.skip_permissions, with the short-lived auto.permissions switch carried over."""
    agents, auto = d.get("agents") or {}, d.get("auto") or {}
    if "skip_permissions" in agents:
        return bool(agents["skip_permissions"])
    if "permissions" in auto:
        return bool(auto["permissions"])
    return True


def _auto_section(d: dict) -> AutoConfig:
    """[auto], with the old `agents.auto_dispatch` carried over: that setting moved here as `auto.dispatch`."""
    values = dict(d.get("auto") or {})
    moved = (d.get("agents") or {}).get("auto_dispatch")
    if moved is not None and "dispatch" not in values:
        values["dispatch"] = moved
    return _section(AutoConfig, values)


def _slug(value: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "-" for c in value)


def load_config(path: Path) -> Config:
    """config.toml, with config.local.toml on top.

    config.toml is the project's own settings and belongs in git; config.local.toml is yours alone (it is
    gitignored) and overrides single keys — your editor, your models, a smaller concurrency on a laptop."""
    data = _read(path)
    for section, values in _read(local_path(path)).items():
        if isinstance(values, dict) and isinstance(data.get(section), dict):
            data[section] = {**data[section], **values}
        else:
            data[section] = values
    return Config.from_dict(data)


def local_path(path: Path) -> Path:
    return path.parent / LOCAL_NAME


def config_stamp(path: Path) -> tuple:
    """What the two config files look like right now: whoever holds a Config compares this with the stamp it
    took when it read them, and reloads when they differ."""
    return tuple(p.stat().st_mtime_ns if p.is_file() else 0 for p in (path, local_path(path)))


def local_keys(path: Path) -> set[str]:
    """The dotted settings config.local.toml overrides, so a change to config.toml can say when it is shadowed."""
    return {f"{section}.{key}" for section, values in _read(local_path(path)).items()
            if isinstance(values, dict) for key in values}


def _read(path: Path) -> dict:
    if not path.is_file():
        return {}
    with path.open("rb") as f:
        return tomllib.load(f)


def save_config(path: Path, config: Config) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(tomli_w.dumps(config.to_dict()))


SETTABLE_KEYS = {
    "agents.concurrency": int,
    "agents.workdir": str,
    "agents.group_agent": bool,
    "agents.group_settle": int,
    "agents.worktree_base": str,
    "agents.tool": str,
    "agents.merge_into": str,
    "agents.clean_worktrees": bool,
    "agents.keep_transcripts": bool,
    "agents.reload_supermanager": bool,
    "agents.model": str,
    "agents.plan_model": str,
    "agents.work_model": str,
    "agents.effort": str,
    "agents.skip_permissions": bool,
    "agents.allow_skip_permissions": bool,
    "agents.planning": str,
    "agents.budget_tokens": int,
    "agents.budget_usd": float,
    "agents.on_budget": str,
    "agents.on_finish": str,
    "agents.close_done_after": int,
    "agents.auto_trust": bool,
    "power.keep_awake": bool,
    "power.awake_when_closed": bool,
    "power.wake_with": str,
    "power.mouse_grace": int,
    "remote.enabled": bool,
    "remote.name": str,
    "remote.spawn": str,
    "remote.capacity": int,
    "remote.adopt": bool,
    "auto.everything": bool,
    "auto.dispatch": bool,
    "auto.plan": bool,
    "manager.model": str,
    "manager.effort": str,
    "manager.resume": bool,
    "manager.autostart": bool,
    "manager.can_edit_files": bool,
    "manager.exit_closes_all": bool,
    "tasks.view": str,
    "tasks.group_by": str,
    "tasks.group_rows": bool,
    "tasks.hide_done": bool,
    "tasks.editor": str,
    "tasks.path": str,
    "tasks.in_git": bool,
    "tasks.min_problem_chars": int,
    "tasks.require_verification": bool,
    "notify.bell": bool,
    "notify.quiet_screen_off": bool,
}


SETTING_HELP = {
    "agents.concurrency": "How many agents may run at the same time.",
    "agents.workdir": "Where an agent works: worktree (its own copy of the repo on a branch sm/<task>, which "
                      "supermanager merges when the work is done) or project (the project folder itself, on the "
                      "branch you are on — nothing to merge, and agents see each other's edits).",
    "agents.group_agent": "Tasks that carry the same `group` are one piece of work: one agent does them all, in "
                          "one copy of the repo, on one branch sm/<group>, and they merge together when the last "
                          "of them is done. Off: each task still shares the group's copy of the repo, but gets "
                          "an agent of its own.",
    "agents.group_settle": "Seconds a group waits, after its newest task was written, before anything starts it "
                           "by itself. One request often becomes several tasks one after another, and this is "
                           "what lets them go to one agent together instead of the first one running off alone. "
                           "Starting a task by hand ignores it. 0 = start as soon as a task is there.",
    "agents.worktree_base": "What new agent branches start from (HEAD or a branch name).",
    "agents.tool": "What agents run by default. A task can say otherwise.",
    "agents.merge_into": "Branch an agent merges its work into when you approve at the end (empty = whatever branch the project is on).",
    "agents.clean_worktrees": "Delete a task's worktree once it is done or cancelled (the branch keeps the work). A worktree with uncommitted changes is kept.",
    "agents.keep_transcripts": "Copy a session's transcript into .supermanager/agents/<id>/transcripts/ when it ends (that folder is never in git).",
    "agents.reload_supermanager": "When a task changes supermanager itself, restart this workspace with the new code once the agent is done (its agents keep running).",
    "agents.model": "Model for an agent the two settings below do not cover: a session you start without a "
                    "task, and every codex session (empty = the tool's default), e.g. gpt-6-astra.",
    "agents.plan_model": "Model of the planning agent — the one that reads your code and writes the plan (opus "
                         "by default). Empty falls back to agents.model. Claude only: a codex task uses "
                         "agents.model.",
    "agents.work_model": "Model of the agent that does the work, once there is a plan (opus by default). Empty "
                         "falls back to agents.model. Claude only: a codex task uses agents.model.",
    "agents.effort": "Default effort for agents, in the levels the tool above understands.",
    "agents.skip_permissions": "Agents run with every permission granted: no prompt for an edit, a command or a "
                               "tool, and supermanager's own tools are always allowed. Off makes them ask, which "
                               "means a task can sit waiting for you.",
    "agents.allow_skip_permissions": "When agents do ask (skip_permissions off), let you choose 'bypass "
                                     "permissions' in the prompt to stop the asking for the rest of the session.",
    "agents.on_finish": "What happens when an agent reports its task done: merge (commit, merge into the "
                        "working branch, remove the copy of the repo, close the session), ask (it puts the "
                        "question to you first) or notify (never merges: it tells you what is ready and on "
                        "which branch, and the branch waits for you).",
    "agents.planning": "How much planning a task gets before anything is written. planner: a planning agent "
                       "goes first — it reads your code, asks you whatever is unclear, writes the plan onto the "
                       "task, and the agent that does the work starts from it. agent: one agent plans and "
                       "works, in plan mode, and you approve its plan. off: no planning step at all — the agent "
                       "reads what it needs and gets straight to work. A single task can say otherwise, and the "
                       "manager asks you before planning one that looks too big to start blind.",
    "agents.budget_tokens": "Tokens one task may spend, counted over every session that works on it (0 = no "
                            "ceiling). A task can carry its own budget, which wins over this one.",
    "agents.budget_usd": "What one task may cost in dollars, from the same count (0 = no ceiling). Whichever "
                         "ceiling is reached first ends it.",
    "agents.on_budget": "What happens when a task reaches its budget: notify (you are told, the agent carries "
                        "on), pause (Esc in its session, the work is kept) or stop (its agent is killed and the "
                        "task becomes interrupted). You are told either way.",
    "agents.close_done_after": "Seconds to wait before closing the session of an agent that reported done.",
    "agents.auto_trust": "Answer Claude Code's 'trust this folder?' dialog for new worktrees.",
    "power.keep_awake": "Keep this computer awake while supermanager runs, so agents keep working when you walk "
                        "away. This says nothing about the screen: it may still go black by itself, and any "
                        "mouse move brings that back. Ask the manager to turn it off and the two settings "
                        "below decide what brings it back.",
    "power.awake_when_closed": "Keep working with the laptop lid shut — close it and walk off, the agents "
                               "carry on. On macOS this is a machine-wide setting (`pmset disablesleep`) that "
                               "needs root: supermanager sets it only if sudo needs no password, tells you the "
                               "command otherwise, and puts it back when it stops. On Linux the inhibitor "
                               "covers the lid switch with no fuss. Watch the heat in a closed bag.",
    "power.wake_with": "What brings the screen back once you have put it out: keyboard (a key press, and a "
                       "mouse that only bumps it is ignored) or anything (a mouse move counts too). macOS "
                       "only — elsewhere whatever the display does is left alone.",
    "power.mouse_grace": "With power.wake_with = anything: seconds after the screen goes out during which the "
                         "mouse still does not count, so the hand you are moving off the trackpad does not "
                         "bring the screen straight back. A key press works from the first second.",
    "remote.enabled": "Run `claude remote-control` for this project, so you can start a session in it from "
                      "claude.ai/code or the Claude app on your phone.",
    "remote.name": "What this project is called in claude.ai/code and in the app ({project} = the project name).",
    "remote.spawn": "Where a session you start from the app runs: worktree (its own copy of the repo, like an "
                    "agent), same-dir (the project itself) or session.",
    "remote.capacity": "How many sessions started from the app may run at once.",
    "remote.adopt": "Show every Claude session started in this project on the agents page — the ones you start "
                    "from your phone, and the ones you start by hand in a terminal.",
    "auto.everything": "Hand the whole loop over: the four settings below all count as on, so work starts, plans "
                       "are taken as approved, finished work is merged, and agents never stop to ask. One toggle "
                       "gives it back.",
    "auto.dispatch": "Start the next backlog task by itself whenever a slot frees — no one has to ask for it.",
    "auto.plan": "Agents do not wait for you to approve their plan: each one plans, writes the plan on its task, "
                 "and starts implementing.",
    "manager.model": "Model for the manager (empty = default).",
    "manager.effort": "Effort for the manager.",
    "manager.autostart": "Start the manager when the workspace opens.",
    "manager.can_edit_files": "Let the manager edit files itself (off = it can only plan and dispatch agents).",
    "manager.resume": "Restart the manager with its previous conversation.",
    "manager.exit_closes_all": "When you close the manager chat (ctrl+c), stop everything: agents, tasks page, tmux.",
    "tasks.path": "Folder (relative to the project) where task files T-001.md live; commit it to share the backlog.",
    "tasks.min_problem_chars": "Minimum length of a task's problem description.",
    "tasks.require_verification": "A task must say how to check it before it is accepted.",
    "tasks.hide_done": "Hide finished tasks (done, cancelled) on the tasks page; h shows them for this session.",
    "tasks.in_git": "Commit the task files with the project, so the backlog is shared (off = a .gitignore keeps them local).",
    "tasks.view": "How the tasks page shows them: table is a list with everything at a glance, board a kanban of columns. v switches it on the page for the session; `list` and `kanban` work as names too.",
    "tasks.group_by": "What tasks are grouped by — the board's columns, the table's headings.",
    "tasks.group_rows": "Show a heading per group in the table (off = one flat list). G switches it on the page.",
    "tasks.editor": "Command that opens a task file when you press enter on the tasks page (idea, code, vim, ...).",
    "notify.bell": "Ring the terminal bell and mark the window 🔔 when a session needs you.",
    "notify.quiet_screen_off": "No bell while the screen is off — nothing beeps in a dark room. Whatever needs "
                               "you is still on the agents page, and the bell comes back when you do.",
}


KEY_ALIASES = {"agents.auto_dispatch": "auto.dispatch",          # settings that moved; the old names still work
               "auto.permissions": "agents.skip_permissions"}

NO_VALUE = "(default)"   # how an empty choice reads: the tool decides


def key_choices(config: Config, dotted: str) -> tuple[str, ...]:
    """The values a setting can take when they are a fixed set — the config page lists them and steps through
    them with ← →. Empty tuple: the value is free text (a model name, an editor, a branch).

    Effort depends on which tool the agents run, and the groupings on the fields this project defines, so the
    choices are read from the config rather than written down twice."""
    dotted = canonical_key(dotted)
    if dotted not in SETTABLE_KEYS:
        return ()
    section, key = dotted.split(".")
    if dotted == "agents.tool":
        return TOOLS
    if dotted == "agents.workdir":
        return WORKDIRS
    if dotted == "agents.on_finish":
        return FINISH_MODES
    if dotted == "agents.planning":
        return PLANNING_MODES
    if dotted == "agents.on_budget":
        return BUDGET_MODES
    if dotted == "remote.spawn":
        return SPAWN_MODES
    if dotted == "power.wake_with":
        return WAKE_WITH
    if dotted == "tasks.view":
        return tuple(dict.fromkeys(VIEWS.values()))
    if dotted == "tasks.group_by":
        return ("status", *(f.name for f in config.task_fields() if f.column))   # as `g` cycles them
    if key == "effort":
        return ("", *EFFORT_LEVELS[config.agents.tool if section == "agents" else "claude"])
    return ()


def canonical_key(dotted: str) -> str:
    return KEY_ALIASES.get(dotted, dotted)


def get_key(config: Config, dotted: str):
    section, key = canonical_key(dotted).split(".")
    return getattr(getattr(config, section), key)


def workdir_for(config: Config, task_workdir: str = "") -> str:
    """Where this task's agent works: its own copy of the repo (worktree) or the project folder itself
    (project). The task's own `workdir` wins over the project's agents.workdir."""
    return (task_workdir or "").strip() or config.agents.workdir


def planning_for(config: Config, task_planning: str = "") -> str:
    """How much planning this task gets: "planner" (a planning agent first), "agent" (one agent that plans in
    plan mode and waits for an approval) or "off" (it starts the work directly). The task's own `planning`
    wins over the project's agents.planning, which is how the manager plans one task on a project that
    normally does not — and the other way round."""
    return (task_planning or "").strip() or config.agents.planning


ROLE_MODELS = {"plan": "plan_model", "work": "work_model"}   # which setting names the model of which session


def model_for(config: Config, role: str, tool: str) -> str:
    """The model a session runs on when nothing on the task says otherwise.

    A planner runs on agents.plan_model, the agent that does the work on agents.work_model — both opus by
    default. They name Claude models, so a codex session takes agents.model, and so does a session with no
    task (role "")."""
    if tool != "claude" or role not in ROLE_MODELS:
        return config.agents.model
    return getattr(config.agents, ROLE_MODELS[role]) or config.agents.model


def skips_permissions(config: Config, task_autonomy: str = "") -> bool:
    """Does an agent run with everything granted? On by default (agents.skip_permissions): an agent that stops
    to ask is an agent that sits there until someone comes back."""
    return config.agents.skip_permissions or config.auto.everything or task_autonomy == "auto"


def finish_mode(config: Config, task_autonomy: str = "") -> str:
    """What happens when an agent reports a task done — the agent reports, this decides:

    "merge" commits and merges its branch into the base branch, then the worktree and the session are cleaned up;
    "ask" lets the user answer that question first; "notify" never merges, and only tells them what is ready and
    on which branch. A task with autonomy=auto always merges, one with autonomy=ask always asks."""
    if task_autonomy == "auto" or config.auto.everything:
        return "merge"
    if task_autonomy == "ask":
        return "ask"
    return config.agents.on_finish


def asks_nothing(config: Config, task_autonomy: str = "") -> bool:
    """True when nothing about this task waits for the user: it plans and finishes on its own."""
    return autonomy_for(config, task_autonomy).on("plan") and finish_mode(config, task_autonomy) != "ask"


def autonomy_for(config: Config, task_autonomy: str = "") -> AutoConfig:
    """What runs without the user for one task. The task's own `autonomy` wins over the project's [auto]:
    "auto" is yolo (it decides everything itself), "ask" puts every question back to the user."""
    if task_autonomy == "auto":
        return AutoConfig(everything=True)
    if task_autonomy == "ask":
        return AutoConfig()
    return config.auto


FORCED_NOTE = "auto.everything is on, so this happens whatever this switch says."


def override_note(config: Config, dotted: str) -> str:
    """Why a setting's stored value is not what runs. Today only one thing does that: the auto.everything
    master switch, which counts the four steps under it as on."""
    section, key = canonical_key(dotted).split(".")
    if section == "auto" and key in AutoConfig.STEPS and config.auto.everything and not getattr(config.auto, key):
        return FORCED_NOTE
    return ""


def settings_snapshot(config: Config) -> dict[str, dict]:
    """Every setting with its value, its type, what it does, and — when they are a set — the values it takes."""
    return {k: {"value": get_key(config, k), "type": kind.__name__,
                "help": " ".join(filter(None, (SETTING_HELP.get(k, ""), override_note(config, k)))),
                **({"choices": list(key_choices(config, k))} if key_choices(config, k) else {})}
            for k, kind in SETTABLE_KEYS.items()}


def set_key(config: Config, dotted: str, raw: str) -> None:
    dotted = canonical_key(dotted)
    if dotted == "agents.worktrees":   # it became agents.workdir, which says where instead of yes/no
        config.agents.workdir = "worktree" if str(raw).strip().lower() in {"1", "true", "yes", "on"} else "project"
        return
    if dotted == "agents.plan_first":   # it became agents.planning, which can also say "off"
        config.agents.planning = "planner" if str(raw).strip().lower() in {"1", "true", "yes", "on"} else "agent"
        return
    if dotted == "auto.merge":   # it became agents.on_finish, which can also say "notify"
        config.agents.on_finish = "merge" if str(raw).strip().lower() in {"1", "true", "yes", "on"} else "ask"
        return
    if dotted not in SETTABLE_KEYS:
        raise KeyError(f"Unknown setting '{dotted}'. Known: {', '.join(sorted(SETTABLE_KEYS))}")
    section, key = dotted.split(".")
    kind = SETTABLE_KEYS[dotted]
    if kind is bool:
        value: object = str(raw).strip().lower() in {"1", "true", "yes", "on"}
    elif kind is int:
        value = int(raw)
        if key == "concurrency" and value < 1:
            raise ValueError("concurrency must be at least 1")
    elif kind is float:
        value = float(raw)
    else:
        value = str(raw).strip()
        if key == "on_finish" and value not in FINISH_MODES:
            raise ValueError(f"agents.on_finish must be one of {', '.join(FINISH_MODES)}")
        if key == "spawn" and value not in SPAWN_MODES:
            raise ValueError(f"remote.spawn must be one of {', '.join(SPAWN_MODES)}")
        if key == "workdir" and value not in WORKDIRS:
            raise ValueError(f"agents.workdir must be one of {', '.join(WORKDIRS)}")
        if key == "tool" and value not in TOOLS:
            raise ValueError(f"agents.tool must be one of {', '.join(TOOLS)}")
        if key == "planning" and value not in PLANNING_MODES:
            raise ValueError(f"agents.planning must be one of {', '.join(PLANNING_MODES)}")
        if key == "on_budget" and value not in BUDGET_MODES:
            raise ValueError(f"agents.on_budget must be one of {', '.join(BUDGET_MODES)}")
        if key == "view":
            value = VIEWS.get(value, value)
            if value not in set(VIEWS.values()):
                raise ValueError("tasks.view must be table (a list) or board (a kanban)")
        if key == "effort" and value:
            tool = config.agents.tool if section == "agents" else "claude"
            if value not in EFFORT_LEVELS[tool]:
                raise ValueError(f"{dotted} for {tool} must be one of {', '.join(EFFORT_LEVELS[tool])}")
    setattr(getattr(config, section), key, value)
