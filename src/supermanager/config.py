"""Project config (.supermanager/config.toml). Open this to see every setting and its default."""

from __future__ import annotations

import tomllib
from dataclasses import asdict, dataclass, field
from pathlib import Path

import tomli_w


@dataclass
class ManagerConfig:
    model: str = ""
    autostart: bool = True
    can_edit_files: bool = False
    rc_name: str = "{project}-manager"
    resume: bool = True
    extra_args: list[str] = field(default_factory=list)


@dataclass
class AgentsConfig:
    concurrency: int = 3
    worktrees: bool = True
    worktree_base: str = "HEAD"
    model: str = ""
    allow_skip_permissions: bool = True
    auto_close_done: bool = False
    auto_dispatch: bool = False
    auto_trust: bool = True
    rc_name: str = "{project}-{task}"
    extra_args: list[str] = field(default_factory=list)


@dataclass
class TasksConfig:
    path: str = ".supermanager/tasks"
    min_problem_chars: int = 60
    require_verification: bool = True
    editor: str = "idea"        # command that opens a task file for editing (`i` in the admin), e.g. idea, code, vim


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
            manager=ManagerConfig(**d.get("manager", {})),
            agents=AgentsConfig(**d.get("agents", {})),
            tasks=TasksConfig(**d.get("tasks", {})),
            tmux=TmuxConfig(**d.get("tmux", {})),
            notify=NotifyConfig(**d.get("notify", {})),
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
    "agents.model": str,
    "agents.allow_skip_permissions": bool,
    "agents.auto_close_done": bool,
    "agents.auto_dispatch": bool,
    "agents.auto_trust": bool,
    "manager.model": str,
    "manager.resume": bool,
    "manager.autostart": bool,
    "manager.can_edit_files": bool,
    "tasks.path": str,
    "tasks.min_problem_chars": int,
    "tasks.require_verification": bool,
    "tasks.editor": str,
    "notify.bell": bool,
}


SETTING_HELP = {
    "agents.concurrency": "How many agents may run at the same time.",
    "agents.worktrees": "Give each agent its own git worktree and branch sm/<task>.",
    "agents.worktree_base": "What new agent branches start from (HEAD or a branch name).",
    "agents.model": "Model for agents (empty = Claude Code default), e.g. opus.",
    "agents.allow_skip_permissions": "Let you choose 'bypass permissions' when approving an agent's plan.",
    "agents.auto_close_done": "Close an agent's session 20 s after it reports done.",
    "agents.auto_dispatch": "Start the next backlog task automatically when a slot frees.",
    "agents.auto_trust": "Answer Claude Code's 'trust this folder?' dialog for new worktrees.",
    "manager.model": "Model for the manager (empty = default).",
    "manager.autostart": "Start the manager when the workspace opens.",
    "manager.can_edit_files": "Let the manager edit files itself (off = it can only plan and dispatch agents).",
    "manager.resume": "Restart the manager with its previous conversation.",
    "tasks.path": "Folder (relative to the project) where task files T-001.md live; commit it to share the backlog.",
    "tasks.min_problem_chars": "Minimum length of a task's problem description.",
    "tasks.require_verification": "A task must say how to check it before it is accepted.",
    "tasks.editor": "Command that opens a task file when you press i in the admin (idea, code, vim, ...).",
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
    setattr(getattr(config, section), key, value)
