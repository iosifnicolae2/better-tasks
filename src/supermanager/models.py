"""Data shapes: Task, AgentInfo, ManagerInfo, Event, State. Open this to see what a task can contain.

A free agent (A-001…) is an AgentInfo without a task: a plain Claude session you opened from the agents page."""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass, field
from enum import StrEnum
from typing import Any


class TaskStatus(StrEnum):
    BACKLOG = "backlog"
    PLANNING = "planning"      # agent running, plan not yet approved
    WORKING = "working"        # plan approved, agent implementing
    BLOCKED = "blocked"        # agent waiting on a human answer (session still open)
    DONE = "done"
    INTERRUPTED = "interrupted"  # agent session ended before completion
    CANCELLED = "cancelled"


ACTIVE_STATUSES = {TaskStatus.PLANNING, TaskStatus.WORKING, TaskStatus.BLOCKED}
FINISHED_STATUSES = {TaskStatus.DONE, TaskStatus.CANCELLED}
PRIORITIES = ("P0", "P1", "P2", "P3")


@dataclass
class AgentInfo:
    session_id: str
    tmux_window: str
    cwd: str
    rc_name: str               # Remote Control name (claude only; "" for codex)
    worktree: str | None = None
    branch: str | None = None
    tool: str = "claude"       # what runs in the window: claude or codex
    model: str = ""            # "" = the tool's default
    effort: str = ""
    transcript: str = ""       # the tool's own transcript file, as its hooks report it
    started_at: float = field(default_factory=time.time)
    finished_at: float | None = None
    phase: str = "starting"    # starting | busy | idle | ended
    last_activity: float = field(default_factory=time.time)
    session_open: bool = True
    attention: str = ""        # why the session waits for you ("" = it does not); shown as a bell


@dataclass
class ManagerInfo:
    session_id: str
    tmux_window: str
    rc_name: str
    started_at: float = field(default_factory=time.time)
    phase: str = "starting"
    last_activity: float = field(default_factory=time.time)
    session_open: bool = True
    connected: bool = False
    attention: str = ""


@dataclass
class Task:
    id: str
    title: str
    problem: str
    expected_outcome: str
    acceptance_criteria: list[str]
    verification: str
    context: str = ""
    plan: str = ""             # how the agent intends to do it; the agent keeps it current (update_plan)
    priority: str = "P2"
    fields: dict[str, Any] = field(default_factory=dict)   # labels, scheduled, and whatever config.toml defines
    tool: str = ""             # per-task agent settings; "" = the agents.* default from config
    model: str = ""
    effort: str = ""
    status: str = TaskStatus.BACKLOG
    agent: AgentInfo | None = None
    sessions: list[dict[str, Any]] = field(default_factory=list)   # every agent session that worked on this task
    progress: list[dict[str, Any]] = field(default_factory=list)
    result: dict[str, Any] | None = None
    blocked_reason: str | None = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    @property
    def is_active(self) -> bool:
        return self.status in ACTIVE_STATUSES

    def touch(self) -> None:
        self.updated_at = time.time()

    def brief(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "priority": self.priority,
            "status": self.status,
            "tool": self.tool, "model": self.model, "effort": self.effort,
            **{k: v for k, v in self.fields.items() if v not in ("", None, [])},
            "sessions": len(self.sessions),
            "agent_phase": self.agent.phase if self.agent else None,
            "branch": self.agent.branch if self.agent else None,
        }


@dataclass
class Event:
    ts: float
    kind: str
    message: str
    task_id: str | None = None


@dataclass
class State:
    tasks: dict[str, Task] = field(default_factory=dict)
    order: list[str] = field(default_factory=list)
    next_task_number: int = 1
    manager: ManagerInfo | None = None
    events: list[Event] = field(default_factory=list)
    pending_manager_events: list[str] = field(default_factory=list)
    free_agents: dict[str, AgentInfo] = field(default_factory=dict)   # id "A-001" -> session, no task
    next_agent_number: int = 1

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "State":
        tasks = {}
        for tid, td in d.get("tasks", {}).items():
            agent = td.get("agent")
            td = {**td, "agent": AgentInfo(**agent) if agent else None}
            td.setdefault("sessions", [])
            td.setdefault("fields", {})
            tasks[tid] = Task(**td)
        manager = d.get("manager")
        return cls(
            tasks=tasks,
            order=[t for t in d.get("order", []) if t in tasks],
            next_task_number=d.get("next_task_number", 1),
            manager=ManagerInfo(**manager) if manager else None,
            events=[Event(**e) for e in d.get("events", [])],
            pending_manager_events=list(d.get("pending_manager_events", [])),
            free_agents={aid: AgentInfo(**a) for aid, a in d.get("free_agents", {}).items()},
            next_agent_number=d.get("next_agent_number", 1),
        )
