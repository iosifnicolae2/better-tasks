"""Project config (.supermanager/config.toml). Open this to see every setting and its default."""

from __future__ import annotations

import tomllib
from dataclasses import asdict, dataclass, field
from dataclasses import fields as dataclasses_fields
from pathlib import Path

import tomli_w

TOOLS = ("claude", "codex")   # what an agent session runs; the manager is always Claude
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
    worktrees: bool = True
    worktree_base: str = "HEAD"
    tool: str = "claude"          # claude or codex; a task can override it
    merge_into: str = ""          # branch an agent merges into when you say yes ("" = the branch the project is on)
    model: str = ""               # empty = the tool's own default; must be a model of that tool
    effort: str = ""              # claude: low..max, codex: minimal..xhigh; empty = the tool's default
    allow_skip_permissions: bool = True
    close_done_after: int = 20   # seconds between an agent reporting done and its session being closed
    auto_dispatch: bool = False
    auto_trust: bool = True
    rc_name: str = "{project}-{task}"
    extra_args: list[str] = field(default_factory=list)         # appended to every `claude` agent command line
    codex_extra_args: list[str] = field(default_factory=list)   # appended to every `codex` agent command line


@dataclass
class TasksConfig:
    path: str = ".supermanager/tasks"
    min_problem_chars: int = 60
    require_verification: bool = True
    hide_done: bool = True      # finished tasks (done, cancelled) stay out of the tasks page until you press h
    keep_transcripts: bool = True       # copy each finished session's transcript next to the task files
    gitignore_transcripts: bool = True  # ...and keep those copies out of git
    editor: str = "idea"        # command that opens a task file for editing (enter on the tasks page), e.g. idea, code, vim


@dataclass
class TmuxConfig:
    session: str = "sm-{project}"


@dataclass
class NotifyConfig:
    bell: bool = True    # ring the terminal bell and mark the window 🔔 when a session waits for you


@dataclass
class Config:
    project_name: str = ""
    manager: ManagerConfig = field(default_factory=ManagerConfig)
    agents: AgentsConfig = field(default_factory=AgentsConfig)
    tasks: TasksConfig = field(default_factory=TasksConfig)
    tmux: TmuxConfig = field(default_factory=TmuxConfig)
    notify: NotifyConfig = field(default_factory=NotifyConfig)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["project"] = {"name": d.pop("project_name")}
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Config":
        return cls(
            project_name=d.get("project", {}).get("name", ""),
            manager=_section(ManagerConfig, d.get("manager")),
            agents=_section(AgentsConfig, d.get("agents")),
            tasks=_section(TasksConfig, d.get("tasks")),
            tmux=_section(TmuxConfig, d.get("tmux")),
            notify=_section(NotifyConfig, d.get("notify")),
        )

    def fmt(self, template: str, **extra: str) -> str:
        return template.format(project=self.project_name, **extra)

    @property
    def tmux_session(self) -> str:
        return _slug(self.fmt(self.tmux.session))

    def manager_rc_name(self) -> str:
        return self.fmt(self.manager.rc_name)

    def agent_rc_name(self, task_id: str) -> str:
        return self.fmt(self.agents.rc_name, task=task_id)


def _section(kind, values: dict | None):
    """Build one config section, ignoring keys this version does not know (a config written by an older or
    newer supermanager still loads)."""
    fields = {f.name for f in dataclasses_fields(kind)}
    return kind(**{k: v for k, v in (values or {}).items() if k in fields})


def _slug(value: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "-" for c in value)


def load_config(path: Path) -> Config:
    with path.open("rb") as f:
        return Config.from_dict(tomllib.load(f))


def save_config(path: Path, config: Config) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(tomli_w.dumps(config.to_dict()))


SETTABLE_KEYS = {
    "agents.concurrency": int,
    "agents.worktrees": bool,
    "agents.worktree_base": str,
    "agents.tool": str,
    "agents.merge_into": str,
    "agents.model": str,
    "agents.effort": str,
    "agents.allow_skip_permissions": bool,
    "agents.close_done_after": int,
    "agents.auto_dispatch": bool,
    "agents.auto_trust": bool,
    "manager.model": str,
    "manager.effort": str,
    "manager.resume": bool,
    "manager.autostart": bool,
    "manager.can_edit_files": bool,
    "manager.exit_closes_all": bool,
    "tasks.path": str,
    "tasks.min_problem_chars": int,
    "tasks.require_verification": bool,
    "tasks.hide_done": bool,
    "tasks.keep_transcripts": bool,
    "tasks.gitignore_transcripts": bool,
    "tasks.editor": str,
    "notify.bell": bool,
}


SETTING_HELP = {
    "agents.concurrency": "How many agents may run at the same time.",
    "agents.worktrees": "Give each agent its own git worktree and branch sm/<task>.",
    "agents.worktree_base": "What new agent branches start from (HEAD or a branch name).",
    "agents.tool": "What agents run by default: claude or codex. A task can say otherwise.",
    "agents.merge_into": "Branch an agent merges its work into when you approve at the end (empty = whatever branch the project is on).",
    "agents.model": "Default model for agents (empty = the tool's default), e.g. opus, or gpt-6-astra for codex.",
    "agents.effort": "Default effort for agents (empty = the tool's default). claude: low/medium/high/xhigh/max, codex: minimal/low/medium/high/xhigh.",
    "agents.allow_skip_permissions": "Let you choose 'bypass permissions' when approving an agent's plan.",
    "agents.close_done_after": "Seconds to wait before closing the session of an agent that reported done.",
    "agents.auto_dispatch": "Start the next backlog task automatically when a slot frees.",
    "agents.auto_trust": "Answer Claude Code's 'trust this folder?' dialog for new worktrees.",
    "manager.model": "Model for the manager (empty = default).",
    "manager.effort": "Effort for the manager (empty = default): low, medium, high, xhigh or max.",
    "manager.autostart": "Start the manager when the workspace opens.",
    "manager.can_edit_files": "Let the manager edit files itself (off = it can only plan and dispatch agents).",
    "manager.resume": "Restart the manager with its previous conversation.",
    "manager.exit_closes_all": "When you close the manager chat (ctrl+c), stop everything: agents, tasks page, tmux.",
    "tasks.path": "Folder (relative to the project) where task files T-001.md live; commit it to share the backlog.",
    "tasks.min_problem_chars": "Minimum length of a task's problem description.",
    "tasks.require_verification": "A task must say how to check it before it is accepted.",
    "tasks.hide_done": "Hide finished tasks (done, cancelled) on the tasks page; h shows them for this session.",
    "tasks.keep_transcripts": "Copy each agent session's transcript into <tasks>/sessions/<task-id>/ when it ends.",
    "tasks.gitignore_transcripts": "Keep those transcript copies out of git (off = they are committed with the tasks).",
    "tasks.editor": "Command that opens a task file when you press enter on the tasks page (idea, code, vim, ...).",
    "notify.bell": "Ring the terminal bell and mark the window 🔔 when a session needs you.",
}


def get_key(config: Config, dotted: str):
    section, key = dotted.split(".")
    return getattr(getattr(config, section), key)


def settings_snapshot(config: Config) -> dict[str, dict]:
    return {k: {"value": get_key(config, k), "type": kind.__name__, "help": SETTING_HELP.get(k, "")}
            for k, kind in SETTABLE_KEYS.items()}


def set_key(config: Config, dotted: str, raw: str) -> None:
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
    else:
        value = str(raw).strip()
        if key == "tool" and value not in TOOLS:
            raise ValueError(f"agents.tool must be one of {', '.join(TOOLS)}")
        if key == "effort" and value:
            tool = config.agents.tool if section == "agents" else "claude"
            if value not in EFFORT_LEVELS[tool]:
                raise ValueError(f"{dotted} for {tool} must be one of {', '.join(EFFORT_LEVELS[tool])}")
    setattr(getattr(config, section), key, value)
