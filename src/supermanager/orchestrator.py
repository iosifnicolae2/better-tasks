"""The brain: backlog, slots, spawning agents, and telling the manager what happened.

Open this when a task's status, a slot count, or a manager notification is not what you expected.
"""

from __future__ import annotations

import os
import re
import shutil
import signal
import subprocess
import threading
import time
from collections.abc import Callable
from dataclasses import asdict
from pathlib import Path
from typing import Any

from . import launcher, prompts, taskfiles, worktree
from .config import Config, get_key, local_keys, save_config, set_key, settings_snapshot
from .launcher import AgentSettings
from .models import (ACTIVE_STATUSES, FINISHED_STATUSES, PRIORITIES, WAITING_STATUSES, AgentInfo, Event,
                     ManagerInfo, State, Task, TaskStatus)
from .paths import ProjectPaths
from .store import StateStore
from .tmux import AGENTS_WINDOW, DASHBOARD_WINDOW, MANAGER_WINDOW, Tmux, TmuxError

EDITABLE_FIELDS = {"title", "problem", "expected_outcome", "acceptance_criteria", "verification", "context", "plan",
                   "priority", "tool", "model", "effort"}
AGENT_SETTING_FIELDS = ("tool", "model", "effort")
RESUME_GRACE_SECONDS = 25
TASKS_IGNORE_HEADER = "# tasks.in_git is off: the backlog stays on this machine.\n"
IDLE_RECHECK_SECONDS = 20   # how long to wait before looking again at a session that ended its turn while busy
IDLE_RECHECKS = 3
# What a session's status line says while it is still working: "1 shell, 1 monitor", "2 tasks", "esc to interrupt".
BACKGROUND_WORK = re.compile(r"\b\d+\s+(shell|monitor|task|job)s?\b|esc to interrupt", re.I)
# Startup dialogs a fresh session may show, and the keys that answer "yes". Claude lists "No" first (Down+Enter);
# Codex preselects "Yes" (Enter).
STARTUP_DIALOGS = {
    "claude": {"Yes, I trust this folder": ("Down", "Enter"), "Yes, I accept": ("Down", "Enter")},
    "codex": {"Do you trust the contents of this directory?": ("Enter",)},
}


class OrchestratorError(Exception):
    """A user-facing problem (bad input, no free slot, ...). The message is safe to show as-is."""


class Orchestrator:
    def __init__(self, paths: ProjectPaths, config: Config):
        self.paths = paths
        self.config = config
        self.store = StateStore(paths.state, paths.tasks_dir(config.tasks.path))
        self.state: State = self.store.load()
        self.tmux = Tmux(config.tmux_session)
        self._lock = threading.RLock()
        self._listeners: list[Callable[[Event], None]] = []
        self._manager_resume_pending = False
        self.on_exit_request: Callable[[str], None] | None = None   # set by the tasks page / headless loop
        self.exit_requested: str | None = None

    # ------------------------------------------------------------------ infra
    def subscribe(self, callback: Callable[[Event], None]) -> None:
        self._listeners.append(callback)

    def save(self) -> None:
        with self._lock:
            self.store.save(self.state)

    def _emit(self, kind: str, message: str, task_id: str | None = None, notify_manager: bool = False) -> None:
        event = Event(ts=time.time(), kind=kind, message=message, task_id=task_id)
        with self._lock:
            self.state.events.append(event)
            if notify_manager:
                self.state.pending_manager_events.append(message)
            self.store.save(self.state)
        if notify_manager:
            self._deliver_to_manager(message)
        for cb in list(self._listeners):
            try:
                cb(event)
            except Exception:  # a broken listener must never break the daemon
                pass

    def _task(self, task_id: str) -> Task:
        task = self.state.tasks.get(task_id.upper() if task_id else "")
        if not task:
            raise OrchestratorError(f"No task with id '{task_id}'. Use list_tasks to see valid ids.")
        return task

    # ----------------------------------------------------------------- status
    def free_slots(self) -> int:
        active = sum(1 for t in self.state.tasks.values() if t.is_active)
        active += sum(1 for a in self.state.free_agents.values() if a.session_open)
        return max(0, self.config.agents.concurrency - active)

    def manager_alive(self) -> bool:
        m = self.state.manager
        return bool(m and m.session_open and self.tmux.window_alive(m.tmux_window))

    def status(self) -> dict[str, Any]:
        counts: dict[str, int] = {}
        for t in self.state.tasks.values():
            counts[t.status] = counts.get(t.status, 0) + 1
        m = self.state.manager
        return {
            "project": self.config.project_name,
            "root": str(self.paths.root),
            "concurrency": self.config.agents.concurrency,
            "free_slots": self.free_slots(),
            "worktrees": self.config.agents.worktrees,
            "auto_dispatch": self.config.agents.auto_dispatch,
            "tmux_session": self.config.tmux_session,
            "manager": None if not m else {
                "running": self.manager_alive(), "phase": m.phase, "rc_name": m.rc_name,
                "session_id": m.session_id, "connected": m.connected,
            },
            "task_counts": counts,
            "free_agents": sum(1 for a in self.state.free_agents.values() if a.session_open),
            "agent_defaults": {f: getattr(self.config.agents, f) for f in AGENT_SETTING_FIELDS},
            "task_fields": [{"name": f.name, "type": f.type, "help": f.help} for f in self.config.task_fields()],
            "backlog_order": [tid for tid in self.state.order if self.state.tasks[tid].status == TaskStatus.BACKLOG],
            "pending_manager_events": len(self.state.pending_manager_events),
        }

    def set_config(self, key: str, value: str) -> dict[str, Any]:
        with self._lock:
            try:
                set_key(self.config, key, value)
            except (KeyError, ValueError) as exc:
                raise OrchestratorError(str(exc)) from exc
            save_config(self.paths.config, self.config)
            if key == "tasks.path":
                self.store.relocate(self.state, self.paths.tasks_dir(self.config.tasks.path))
            if key in ("tasks.path", "tasks.in_git"):
                self.apply_tasks_gitignore()
        message = f"Setting changed: {key} = {value}"
        if key in local_keys(self.paths.config):
            message += f" — but config.local.toml still overrides it ({get_key(self.config, key)} is what runs)."
        self._emit("config", message)
        if key in ("agents.concurrency", "agents.auto_dispatch"):
            self._auto_dispatch()
        return {"key": key, "value": value}

    def get_config(self) -> dict[str, dict]:
        return settings_snapshot(self.config)

    def _agent_settings(self, task: Task | None = None, **overrides: str | None) -> AgentSettings:
        """Config defaults, then the task's own fields, then explicit overrides; validated."""
        values = {f: getattr(self.config.agents, f) for f in AGENT_SETTING_FIELDS}
        for field in AGENT_SETTING_FIELDS:
            for value in (getattr(task, field, "") if task else "", overrides.get(field)):
                if value:
                    values[field] = str(value).strip()
        settings = AgentSettings(**values)
        try:
            settings.validate()
        except ValueError as exc:
            raise OrchestratorError(str(exc)) from exc
        return settings

    def update_bar_counts(self) -> None:
        """Show how many tasks are open and how many agents run next to the page names in the tmux bar."""
        tasks = sum(1 for t in self.state.tasks.values() if t.status not in FINISHED_STATUSES)
        agents = len(self.list_agents())
        self.tmux.set_counts({DASHBOARD_WINDOW: tasks, AGENTS_WINDOW: agents})

    # ------------------------------------------------------------------ tasks
    def validate_task(self, title: str, problem: str, expected_outcome: str, acceptance_criteria: list[str],
                      verification: str, priority: str) -> list[str]:
        errors = []
        if not title or len(title.strip()) < 5:
            errors.append("title: give a short, specific title (at least 5 characters).")
        if len(title.strip()) > 120:
            errors.append("title: keep it under 120 characters; details belong in the problem.")
        min_chars = self.config.tasks.min_problem_chars
        if len((problem or "").strip()) < min_chars:
            errors.append(f"problem: describe what is wrong or wanted, where, and how it shows (at least {min_chars} characters).")
        if len((expected_outcome or "").strip()) < 15:
            errors.append("expected_outcome: say what 'done' looks like in one or two sentences.")
        criteria = [c.strip() for c in (acceptance_criteria or []) if c and c.strip()]
        if not criteria:
            errors.append("acceptance_criteria: list at least one observable, checkable statement.")
        for c in criteria:
            if len(c) < 10:
                errors.append(f"acceptance_criteria: '{c}' is too vague to check; be concrete.")
        if self.config.tasks.require_verification and len((verification or "").strip()) < 10:
            errors.append("verification: say how to check the result (a command, or precise manual steps).")
        if priority not in PRIORITIES:
            errors.append(f"priority: use one of {', '.join(PRIORITIES)}.")
        return errors

    def _task_fields(self, values: dict[str, Any] | None, onto: dict[str, Any] | None = None) -> dict[str, Any]:
        """Clean the extra fields (labels, scheduled, whatever config.toml defines) and merge them onto a task's."""
        fields = dict(onto or {})
        for name, raw in (values or {}).items():
            spec = self.config.field(name)
            if not spec:
                known = ", ".join(f.name for f in self.config.task_fields()) or "none"
                raise OrchestratorError(f"Unknown task field '{name}'. This project has: {known}. "
                                        "Add one under [[tasks.fields]] in .supermanager/config.toml.")
            fields[name] = spec.parse(raw)
        return {k: v for k, v in fields.items() if v not in ("", None, [])}

    def create_task(self, title: str, problem: str, expected_outcome: str, acceptance_criteria: list[str],
                    verification: str, context: str = "", priority: str = "P2",
                    tool: str = "", model: str = "", effort: str = "", fields: dict[str, Any] | None = None,
                    asked: str = "") -> Task:
        priority = (priority or "P2").upper()
        errors = self.validate_task(title, problem, expected_outcome, acceptance_criteria, verification, priority)
        if errors:
            raise OrchestratorError("Task is not clear enough yet. Ask the user, then fix: " + " ".join(errors))
        settings = {f: (v or "").strip() for f, v in zip(AGENT_SETTING_FIELDS, (tool, model, effort))}
        self._agent_settings(None, **settings)   # rejects an unknown tool or effort before the task exists
        with self._lock:
            task_id = f"T-{self.state.next_task_number:03d}"
            self.state.next_task_number += 1
            task = Task(
                id=task_id, title=title.strip(), problem=problem.strip(), expected_outcome=expected_outcome.strip(),
                acceptance_criteria=[c.strip() for c in acceptance_criteria if c.strip()],
                verification=verification.strip(), context=(context or "").strip(), priority=priority,
                fields=self._task_fields(fields), **settings,
            )
            if (asked or "").strip():
                task.requests.append({"ts": time.time(), "text": " ".join(asked.split())})
            self.state.tasks[task_id] = task
            self.state.order.append(task_id)
            self._sort_by_priority()
        self._emit("task", f"Created {task_id} [{priority}] {task.title}", task_id)
        self._auto_dispatch()
        return task

    def create_task_from_template(self, title: str, priority: str = "P2") -> Task:
        """A backlog entry with the template body, meant to be edited by hand. No clarity checks here."""
        if not title or len(title.strip()) < 3:
            raise OrchestratorError("Give the task a title (at least 3 characters).")
        with self._lock:
            task_id = f"T-{self.state.next_task_number:03d}"
            self.state.next_task_number += 1
            task = taskfiles.task_from_template(task_id, title, taskfiles.load_template(self.paths.home), priority)
            self.state.tasks[task_id] = task
            self.state.order.append(task_id)
            self._sort_by_priority()
        self._emit("task", f"Created {task_id} from the template: {task.title}. Fill in its file before starting it.", task_id)
        return task

    def task_file(self, task_id: str) -> Path:
        return self.store.tasks.path / f"{self._task(task_id).id}.md"

    def _sort_by_priority(self) -> None:
        """Stable sort: priority first, manual order second."""
        rank = {p: i for i, p in enumerate(PRIORITIES)}
        self.state.order.sort(key=lambda tid: rank.get(self.state.tasks[tid].priority, 9))

    def update_task(self, task_id: str, **fields: Any) -> Task:
        task = self._task(task_id)
        extra = fields.pop("fields", None)
        unknown = set(fields) - EDITABLE_FIELDS
        if unknown:
            raise OrchestratorError(f"Cannot edit {sorted(unknown)}. Editable: {sorted(EDITABLE_FIELDS)}, fields")
        with self._lock:
            if extra is not None:
                task.fields = self._task_fields(extra, task.fields)
            merged = {f: fields.get(f, getattr(task, f)) for f in EDITABLE_FIELDS}
            merged["priority"] = (merged["priority"] or "P2").upper()
            errors = self.validate_task(merged["title"], merged["problem"], merged["expected_outcome"],
                                        merged["acceptance_criteria"], merged["verification"], merged["priority"])
            if errors:
                raise OrchestratorError("Update rejected: " + " ".join(errors))
            self._agent_settings(None, **{f: merged[f] for f in AGENT_SETTING_FIELDS})
            for f, v in merged.items():
                setattr(task, f, v.strip() if isinstance(v, str) else v)
            task.touch()
            self._sort_by_priority()
        self._emit("task", f"Updated {task.id}: {', '.join(sorted(fields))}", task.id)
        return task

    def reorder_backlog(self, ordered_ids: list[str]) -> list[str]:
        ids = [i.upper() for i in ordered_ids]
        with self._lock:
            missing = [i for i in ids if i not in self.state.tasks]
            if missing:
                raise OrchestratorError(f"Unknown task ids: {missing}")
            rest = [i for i in self.state.order if i not in ids]
            self.state.order = ids + rest
        self._emit("task", "Backlog reordered: " + ", ".join(ids))
        return list(self.state.order)

    def move_task(self, task_id: str, delta: int) -> None:
        task = self._task(task_id)
        with self._lock:
            idx = self.state.order.index(task.id)
            new = max(0, min(len(self.state.order) - 1, idx + delta))
            self.state.order.insert(new, self.state.order.pop(idx))
            self.save()

    def cancel_task(self, task_id: str, reason: str = "") -> Task:
        task = self._task(task_id)
        if task.is_active:
            raise OrchestratorError(f"{task.id} has a running agent. Stop the agent first (stop_agent).")
        with self._lock:
            task.status = TaskStatus.CANCELLED
            task.touch()
        self._emit("task", f"Cancelled {task.id}. {reason}".strip(), task.id)
        self._clean_worktree(task, "cancelled")
        return task

    def close_task(self, task_id: str) -> Task:
        """x on the tasks page: the task is finished as far as you are concerned. Its agent (if any) is stopped."""
        task = self._task(task_id)
        if task.agent and task.agent.session_open:
            self.stop_agent(task.id)
        with self._lock:
            task.status = TaskStatus.DONE
            task.blocked_reason = None
            task.result = {"summary": "Closed from the tasks page.", "verification_notes": "", "ts": time.time()}
            task.touch()
        self._emit("done", f"{task.id} '{task.title}' closed.", task.id)
        self._clean_worktree(task, "closed")
        self._auto_dispatch()
        return task

    def delete_task(self, task_id: str) -> None:
        task = self._task(task_id)
        if task.is_active:
            raise OrchestratorError(f"{task.id} has a running agent. Stop it first.")
        if task.agent and task.agent.worktree:
            task.status = TaskStatus.CANCELLED   # the task is going away; its worktree should go with it
            self._clean_worktree(task, "task deleted")
        with self._lock:
            self.state.tasks.pop(task.id)
            self.state.order.remove(task.id)
        self._emit("task", f"Deleted {task.id}", task.id)

    def requeue_task(self, task_id: str) -> Task:
        task = self._task(task_id)
        if task.is_active:
            raise OrchestratorError(f"{task.id} is still running.")
        with self._lock:
            task.status = TaskStatus.BACKLOG
            task.blocked_reason = None
            task.touch()
            if task.id in self.state.order:
                self.state.order.remove(task.id)
            self.state.order.insert(0, task.id)
        self._emit("task", f"Requeued {task.id} at the top of the backlog", task.id)
        self._auto_dispatch()
        return task

    def next_backlog_task(self) -> Task | None:
        for tid in self.state.order:
            if self.state.tasks[tid].status == TaskStatus.BACKLOG:
                return self.state.tasks[tid]
        return None

    def next_queued_task(self) -> Task | None:
        """The first task you asked to start that is still waiting for a slot."""
        for tid in self.state.order:
            if self.state.tasks[tid].status == TaskStatus.QUEUED:
                return self.state.tasks[tid]
        return None

    def list_tasks(self, status: str | None = None, label: str | None = None,
                   field: str | None = None, value: str | None = None) -> list[Task]:
        """The backlog in order. Filters: by status, by label, or by any field (`field`/`value`, where a list
        field matches when it contains the value and a text one when it starts with it — so scheduled=2026-W38
        and scheduled=2026 both work)."""
        tasks = [self.state.tasks[tid] for tid in self.state.order]
        if status:
            tasks = [t for t in tasks if t.status == status]
        if label:
            tasks = [t for t in tasks if label in (t.fields.get("labels") or [])]
        if field and value is not None:
            tasks = [t for t in tasks if _field_matches(t.fields.get(field), value)]
        return tasks

    # --------------------------------------------------------------- dispatch
    def spawn_agent(self, task_id: str | None = None, resume: bool | None = None,
                    tool: str | None = None, model: str | None = None, effort: str | None = None,
                    queue: bool = True) -> Task:
        """Start an agent on a task, or queue the task when every slot is busy (it then starts by itself as soon
        as one frees). tool/model/effort given here are saved on the task, then used."""
        self._require_tmux()
        with self._lock:
            task = self._task(task_id) if task_id else (self.next_queued_task() or self.next_backlog_task())
            if not task:
                raise OrchestratorError("The backlog is empty; nothing to dispatch.")
            if task.is_active:
                raise OrchestratorError(f"{task.id} already has a running agent.")
            if task.status not in WAITING_STATUSES:
                raise OrchestratorError(f"{task.id} is {task.status}; requeue it first if you want it redone.")
            if self.free_slots() <= 0:
                if not queue:
                    raise OrchestratorError(f"All {self.config.agents.concurrency} slots are busy.")
                if task.status != TaskStatus.QUEUED:
                    task.status = TaskStatus.QUEUED
                    task.touch()
                    self.save()
                    self._emit("task", f"{task.id} is queued: it starts as soon as one of the "
                                       f"{self.config.agents.concurrency} slots frees.", task.id)
                return task
            settings = self._agent_settings(task, tool=tool, model=model, effort=effort)
            for field, value in zip(AGENT_SETTING_FIELDS, (tool, model, effort)):
                if value:
                    setattr(task, field, value.strip())

            cwd, wt_path, branch = self._prepare_workdir(task)
            previous = task.agent
            can_resume = bool(previous and previous.session_id and previous.cwd == str(cwd)
                              and previous.tool == settings.tool)
            do_resume = can_resume if resume is None else (resume and can_resume)
            session_id = previous.session_id if do_resume else launcher.new_session_id() if settings.tool == "claude" else ""

            system_prompt = prompts.agent_prompt(self.config, task, str(wt_path) if wt_path else None, branch,
                                                 settings.tool, self.base_branch())
            argv = launcher.agent_argv(self.config, self.paths, task.id, cwd, settings, session_id,
                                       prompts.agent_kickoff(task), do_resume, system_prompt)
            self.tmux.ensure_session(self.paths.root)
            window = self.tmux.new_window(task.id, cwd, argv, launcher.session_env(self.paths, task.id))
            self._auto_accept_dialogs(window, settings.tool)
            task.agent = AgentInfo(
                session_id=session_id, tmux_window=window, cwd=str(cwd),
                rc_name=self.config.agent_rc_name(task.id) if settings.tool == "claude" else "",
                worktree=str(wt_path) if wt_path else None, branch=branch,
                tool=settings.tool, model=settings.model, effort=settings.effort,
            )
            if do_resume and task.sessions:
                task.sessions[-1]["ended_at"] = None   # the same conversation continues
            else:
                task.sessions.append(_session_record(task.agent))
            task.status = TaskStatus.PLANNING
            task.blocked_reason = None
            task.touch()
        verb = "Resumed" if do_resume else "Started"
        where = f"worktree {branch}" if branch else "project root"
        rc = f", RC: {task.agent.rc_name}" if task.agent.rc_name else ""
        self._emit("agent", f"{verb} {settings.label()} agent for {task.id} in {where}{rc}. Waiting for plan approval.", task.id)
        return task

    # ------------------------------------------------------------ free agents
    def spawn_free_agent(self, tool: str | None = None, model: str | None = None, effort: str | None = None) -> dict[str, Any]:
        """A Claude or Codex session in the project root with no task ("New agent" on the agents page)."""
        self._require_tmux()
        with self._lock:
            if self.free_slots() <= 0:
                raise OrchestratorError(
                    f"All {self.config.agents.concurrency} slots are busy. Wait for a session to end or raise agents.concurrency.")
            settings = self._agent_settings(None, tool=tool, model=model, effort=effort)
            agent_id = f"A-{self.state.next_agent_number:03d}"
            self.state.next_agent_number += 1
            session_id = launcher.new_session_id() if settings.tool == "claude" else ""
            argv = launcher.free_agent_argv(self.config, self.paths, agent_id, settings, session_id)
            self.tmux.ensure_session(self.paths.root)
            window = self.tmux.new_window(agent_id, self.paths.root, argv, launcher.session_env(self.paths, agent_id))
            self._auto_accept_dialogs(window, settings.tool)
            self.state.free_agents[agent_id] = AgentInfo(
                session_id=session_id, tmux_window=window, cwd=str(self.paths.root),
                rc_name=self.config.agent_rc_name(agent_id) if settings.tool == "claude" else "",
                tool=settings.tool, model=settings.model, effort=settings.effort)
            self.save()
        self._emit("agent", f"Started {settings.label()} agent {agent_id} in the project root.")
        return {"id": agent_id, **asdict(self.state.free_agents[agent_id])}

    def stop_free_agent(self, agent_id: str) -> None:
        with self._lock:
            info = self.state.free_agents.get(agent_id.upper())
            if not info:
                raise OrchestratorError(f"No agent {agent_id}.")
            self.tmux.kill_window(info.tmux_window)
            del self.state.free_agents[agent_id.upper()]
            self.save()
        self._emit("agent", f"Stopped agent {agent_id}.")

    def list_agents(self) -> list[dict[str, Any]]:
        """Every open session for the agents page: task agents (with their task's status) and free agents."""
        rows = [{"id": t.id, "title": t.title, "task": True, "status": str(t.status), "agent": asdict(t.agent)}
                for t in self.state.tasks.values() if t.agent and t.agent.session_open]
        rows += [{"id": aid, "title": "agent (no task)", "task": False, "status": "", "agent": asdict(a)}
                 for aid, a in self.state.free_agents.items() if a.session_open]
        return rows

    def _free_agent_hook(self, agent_id: str, info: AgentInfo, event: str, payload: dict[str, Any]) -> None:
        with self._lock:
            info.last_activity = time.time()
            self._track_session_id(info, payload)
            if event in ("idle", "busy", "cleared"):
                info.phase = "idle" if event == "cleared" else event
                if event == "busy":
                    info.attention = ""
            elif event == "session-end":
                info.session_open = False
                info.phase = "ended"
                info.attention = ""
                info.finished_at = time.time()
            self.save()
        if event == "idle":
            self._attend(agent_id, "waiting for your reply", when_idle=True)
        elif event in ("notification", "permission"):
            self._attend(agent_id, _attention_reason(payload, event))

    def _prepare_workdir(self, task: Task) -> tuple[Path, Path | None, str | None]:
        if not self.config.agents.worktrees or task.fields.get("conflict_for"):
            return self.paths.root, None, None   # a conflict is resolved where the branches meet: the checkout
        if not self.paths.is_git_repo():
            raise OrchestratorError("Worktrees are on but this folder is not a git repo. Run `git init` or set agents.worktrees=false.")
        branch = f"sm/{task.id}"
        path = self.paths.worktree_path(task.id)
        try:
            worktree.add_worktree(self.paths.root, path, branch, self.config.agents.worktree_base)
        except worktree.GitError as exc:
            raise OrchestratorError(f"Could not create worktree for {task.id}: {exc}") from exc
        return path, path, branch

    def stop_agent(self, task_id: str, requeue: bool = False) -> Task:
        task = self._task(task_id)
        if not task.agent:
            raise OrchestratorError(f"{task.id} has no agent.")
        with self._lock:
            self.tmux.kill_window(task.agent.tmux_window)
            task.agent.session_open = False
            task.agent.phase = "ended"
            task.agent.finished_at = time.time()
            self._sync_session_record(task, ended=True)
            if task.is_active:
                task.status = TaskStatus.BACKLOG if requeue else TaskStatus.INTERRUPTED
            task.touch()
        self._keep_transcript(task)
        self._emit("agent", f"Stopped agent for {task.id} (now {task.status}).", task.id)
        self._auto_dispatch()
        return task

    def close_agent_session(self, task_id: str) -> Task:
        task = self._task(task_id)
        if task.is_active:
            raise OrchestratorError(f"{task.id} is still active; use stop_agent instead.")
        if task.agent and task.agent.session_open:
            self.tmux.kill_window(task.agent.tmux_window)
            task.agent.session_open = False
            task.agent.phase = "ended"
            self._sync_session_record(task, ended=True)
            self.save()
            self._keep_transcript(task)
            self._emit("agent", f"Closed the finished session of {task.id}.", task.id)
        return task

    def _clean_worktree(self, task: Task, why: str) -> int:
        """Delete a finished task's worktree (agents.clean_worktrees). The branch keeps the work, so nothing is
        lost — unless something there was never committed, and then the worktree is kept. Returns bytes freed."""
        agent = task.agent
        if not self.config.agents.clean_worktrees or not agent or not agent.worktree:
            return 0
        path = Path(agent.worktree)
        if not path.exists():
            agent.worktree = None
            worktree.prune(self.paths.root)
            return 0
        if agent.session_open or task.status not in FINISHED_STATUSES:
            return 0
        if worktree.is_dirty(path):
            self._emit("agent", f"Kept the worktree of {task.id}: it has uncommitted changes ({path}).", task.id)
            return 0
        freed = worktree.folder_size(path)
        try:
            worktree.remove_worktree(self.paths.root, path)
        except worktree.GitError as exc:
            self._emit("agent", f"Could not remove the worktree of {task.id}: {exc}", task.id)
            return 0
        with self._lock:
            agent.worktree = None
            self.save()
        self._emit("agent", f"Freed {worktree.human_size(freed)}: removed the worktree of {task.id} ({why}); "
                            f"branch {agent.branch} is kept.", task.id)
        return freed

    def clean_worktrees(self, force: bool = False) -> dict[str, Any]:
        """Sweep: drop the worktrees of every done or cancelled task, and forget the ones already gone.
        force also removes worktrees with uncommitted changes."""
        if not self.paths.is_git_repo():
            return {"removed": [], "kept": [], "freed": 0, "freed_human": "0 B"}
        worktree.prune(self.paths.root)
        removed, kept, freed = [], [], 0
        for task in list(self.state.tasks.values()):
            agent = task.agent
            if not agent or not agent.worktree or task.status not in FINISHED_STATUSES or agent.session_open:
                continue
            path = Path(agent.worktree)
            if not path.exists():
                agent.worktree = None
                continue
            if force and worktree.is_dirty(path):
                size = worktree.folder_size(path)
                try:
                    worktree.remove_worktree(self.paths.root, path, force=True)
                except worktree.GitError as exc:
                    kept.append({"task": task.id, "why": str(exc)})
                    continue
                with self._lock:
                    agent.worktree = None
                self._emit("agent", f"Freed {worktree.human_size(size)}: removed the worktree of {task.id} "
                                    f"with its uncommitted changes; branch {agent.branch} is kept.", task.id)
            else:
                size = self._clean_worktree(task, "cleanup")
                if agent.worktree:
                    kept.append({"task": task.id, "why": "uncommitted changes"})
                    continue
            removed.append({"task": task.id, "freed": size, "branch": agent.branch})
            freed += size
        self.save()
        return {"removed": removed, "kept": kept, "freed": freed, "freed_human": worktree.human_size(freed)}

    def remove_worktree(self, task_id: str, force: bool = False) -> Task:
        task = self._task(task_id)
        if task.is_active:
            raise OrchestratorError(f"{task.id} is still active.")
        if not task.agent or not task.agent.worktree:
            raise OrchestratorError(f"{task.id} has no worktree.")
        self.close_agent_session(task.id)
        try:
            worktree.remove_worktree(self.paths.root, Path(task.agent.worktree), force=force)
        except worktree.GitError as exc:
            raise OrchestratorError(f"git refused to remove the worktree: {exc}. Commit or pass force=true.") from exc
        task.agent.worktree = None
        self.save()
        self._emit("agent", f"Removed worktree of {task.id}; branch {task.agent.branch} is kept.", task.id)
        return task

    def _auto_dispatch(self) -> None:
        """Fill the free slots: first with the tasks you asked to start (queued), then — when
        agents.auto_dispatch is on — with the top of the backlog."""
        while self.free_slots() > 0:
            task = self.next_queued_task() or (self.next_backlog_task() if self.config.agents.auto_dispatch else None)
            if not task:
                return
            try:
                self.spawn_agent(task.id, queue=False)
            except OrchestratorError as exc:
                with self._lock:
                    if task.status == TaskStatus.QUEUED:
                        task.status = TaskStatus.BACKLOG   # it cannot start; do not spin on it
                        task.touch()
                        self.save()
                self._emit("error", f"Could not start {task.id}: {exc}", task.id)
                return

    # ---------------------------------------------------------- agent reports
    def record_request(self, task_id: str, text: str) -> Task:
        """Keep what the user asked, in their own words, in the task's "Asked for" log."""
        task = self._task(task_id)
        text = " ".join((text or "").split())
        if not text:
            raise OrchestratorError("Pass what the user said.")
        with self._lock:
            if not task.requests or task.requests[-1]["text"] != text:
                task.requests.append({"ts": time.time(), "text": text})
                task.touch()
                self.save()
        return task

    def update_plan(self, task_id: str, plan: str) -> Task:
        """The agent writes (or rewrites) the Plan section of its task file."""
        task = self._task(task_id)
        if not (plan or "").strip():
            raise OrchestratorError("Give the plan itself (the steps you intend to take).")
        with self._lock:
            task.plan = plan.strip()
            task.touch()
            self.save()
        self._emit("task", f"{task.id}: plan updated.", task.id)
        return task

    def add_context(self, task_id: str, note: str) -> Task:
        """Append something the agent learned (a constraint, a file, a decision) to the task's Context."""
        task = self._task(task_id)
        note = " ".join((note or "").split())
        if len(note) < 10:
            raise OrchestratorError("Say what you found in one or two sentences.")
        with self._lock:
            task.context = f"{task.context.rstrip()}\n- {note}".strip()
            task.touch()
            self.save()
        self._emit("task", f"{task.id}: context updated — {note[:80]}", task.id)
        return task

    def report_progress(self, task_id: str, note: str) -> Task:
        task = self._task(task_id)
        with self._lock:
            task.progress.append({"ts": time.time(), "note": note.strip()})
            if task.status == TaskStatus.BLOCKED:
                task.status = TaskStatus.WORKING
                task.blocked_reason = None
            if task.agent:
                task.agent.attention = ""
            task.touch()
        self._emit("progress", f"{task.id}: {note.strip()}", task.id)
        return task

    def block_task(self, task_id: str, reason: str) -> Task:
        task = self._task(task_id)
        with self._lock:
            task.status = TaskStatus.BLOCKED
            task.blocked_reason = reason.strip()
            task.touch()
        self._emit("blocked", f"{task.id} is BLOCKED and needs a human answer: {reason.strip()} "
                   f"(RC session: {task.agent.rc_name if task.agent else '?'})", task.id, notify_manager=True)
        self._attend(task.id, f"blocked: {reason.strip()[:80]}")
        return task

    def base_branch(self) -> str:
        """Where an agent's work is merged when you approve it: agents.merge_into, or the branch the project is on."""
        return self.config.agents.merge_into or worktree.current_branch(self.paths.root) or "main"

    def merge_task(self, task_id: str) -> dict[str, Any]:
        """Commit whatever is left in the agent's worktree and merge its branch into the base branch.
        The agent calls this only after the user said yes."""
        task = self._task(task_id)
        agent = task.agent
        if not agent or not agent.worktree or not agent.branch:
            raise OrchestratorError(f"{task.id} has no worktree branch to merge (worktrees are off for it).")
        base = self.base_branch()
        if base == agent.branch:
            raise OrchestratorError(f"{task.id} is already on {base}; nothing to merge.")
        path = Path(agent.worktree)
        try:
            committed = worktree.commit_all(path, f"{task.id} {task.title}")
            head = worktree.merge_branch(self.paths.root, agent.branch, base, f"Merge {agent.branch}: {task.title}")
        except worktree.GitError as exc:
            clash = worktree.conflicting_files(self.paths.root, agent.branch, base)
            if clash:
                fix = self.create_conflict_task(task, base, clash)
                raise OrchestratorError(
                    f"{agent.branch} conflicts with {base} in {', '.join(clash[:5])}. Nothing was merged and your "
                    f"work is safe on {agent.branch}. {fix.id} was created to resolve it; tell the user that, and "
                    "complete your own task with merge=false.") from exc
            raise OrchestratorError(f"Could not merge {agent.branch} into {base}: {exc}") from exc
        self._emit("agent", f"{task.id}: merged {agent.branch} into {base} ({head}).", task.id, notify_manager=True)
        return {"task_id": task.id, "branch": agent.branch, "into": base, "committed": committed, "head": head}

    def create_conflict_task(self, task: Task, base: str, files: list[str]) -> Task:
        """A merge clashed: make a task for it, top of the backlog, and start an agent when a slot is free.

        The agent that resolves it works in the project checkout itself (not a worktree of its own): a merge has
        to happen where both branches meet."""
        branch = task.agent.branch if task.agent else "?"
        existing = next((t for t in self.state.tasks.values()
                         if t.fields.get("conflict_for") == task.id and t.status not in FINISHED_STATUSES), None)
        if existing:
            return existing
        listed = "\n".join(f"- `{f}`" for f in files)
        fix = self.create_task(
            title=f"Resolve the merge conflict of {task.id} into {base}",
            problem=(f"Merging `{branch}` ({task.id}: {task.title}) into `{base}` stops on conflicting changes in:\n"
                     f"{listed}\nBoth sides changed the same lines, so git cannot decide. The merge was aborted; "
                     f"`{base}` and `{branch}` are both untouched."),
            expected_outcome=(f"`{branch}` is merged into `{base}` with every conflict resolved so that both the "
                              f"earlier work on {base} and the work of {task.id} still do what they were meant to."),
            acceptance_criteria=[
                f"git merge --no-ff {branch} completes on {base} with no conflict markers left in the tree",
                "The project builds and its test command passes after the merge",
                f"Nothing that {base} already did is lost, and nothing {task.id} added is dropped",
            ],
            verification=("Run the project's test/build command from CLAUDE.md after the merge, and "
                          f"`git diff --check` plus `grep -rn '<<<<<<<' .` to prove no markers are left."),
            context=(f"Work in the project checkout `{self.paths.root}` on `{base}` — a conflict cannot be resolved "
                     f"in a worktree of its own. Read both sides first (`git log {base}..{branch}` and "
                     f"`git log {branch}..{base}`) and understand what each change was for before you pick or "
                     f"combine. Files: {', '.join(files)}."),
            priority="P0",
            fields={"conflict_for": task.id} if self.config.field("conflict_for") else None,
        )
        self._emit("task", f"{fix.id} created: {task.id} cannot merge into {base} ({len(files)} conflicting file(s)).",
                   fix.id, notify_manager=True)
        self._auto_dispatch()
        return fix

    def complete_task(self, task_id: str, summary: str, verification_notes: str, merge: bool = False) -> Task:
        task = self._task(task_id)
        merged = self.merge_task(task_id) if merge else None
        with self._lock:
            task.status = TaskStatus.DONE
            task.blocked_reason = None
            task.result = {"summary": summary.strip(), "verification_notes": verification_notes.strip(), "ts": time.time()}
            if task.agent:
                task.agent.finished_at = time.time()
                task.agent.attention = ""
            task.touch()
        branch_note = ""
        if merged:
            branch_note = f" Merged into {merged['into']} ({merged['head']})."
        elif task.agent and task.agent.worktree:
            branch_note = (f" Work is on branch {task.agent.branch} "
                           f"({worktree.worktree_summary(self.paths.root, Path(task.agent.worktree))}); not merged.")
        self._emit("done", f"{task.id} '{task.title}' is DONE.{branch_note} Summary: {summary.strip()[:400]}",
                   task.id, notify_manager=True)
        if task.agent:
            # The work is finished: close the session so its slot frees. The worktree, the branch and the
            # session record in the task file stay, so nothing is lost.
            self._keep_transcript(task)
            threading.Timer(self.config.agents.close_done_after, self._safe_close, args=(task.id,)).start()
        self._auto_dispatch()
        return task

    def _safe_close(self, task_id: str) -> None:
        """The session of a finished agent, closed a few seconds after it reported done — and its worktree with it."""
        try:
            self.close_agent_session(task_id)
        except OrchestratorError:
            return
        self._clean_worktree(self._task(task_id), "task done")

    # ------------------------------------------------------------------ hooks
    def hello(self, role: str, task_id: str | None, session_id: str | None) -> dict[str, Any]:
        """Called by the MCP bridge when a Claude session has started and connected."""
        with self._lock:
            if role == "manager" and self.state.manager:
                self.state.manager.connected = True
                self.state.manager.phase = "busy"
                self.state.manager.attention = ""
                self._manager_resume_pending = False
            elif role == "agent" and task_id:
                task = self._task(task_id)
                if task.agent:
                    task.agent.phase = "busy"
                    task.agent.attention = ""
                    task.agent.last_activity = time.time()
            self.save()
        return {"ok": True}

    def handle_hook(self, role: str, task_id: str | None, event: str, payload: dict[str, Any]) -> None:
        if event == "session-end" and payload.get("reason") == "clear":
            event = "cleared"   # /clear starts a new conversation in the same window; the session is not gone
        if role == "manager":
            self._manager_hook(event, payload)
        elif task_id and task_id.upper() in self.state.tasks:
            self._agent_hook(self.state.tasks[task_id.upper()], event, payload)
        elif task_id and task_id.upper() in self.state.free_agents:
            self._free_agent_hook(task_id.upper(), self.state.free_agents[task_id.upper()], event, payload)

    @staticmethod
    def _track_session_id(info: ManagerInfo | AgentInfo, payload: dict[str, Any]) -> None:
        """Every hook carries the session's own id and transcript file: remember both. (/clear gives Claude a new
        session id, and a Codex session only tells us its id once it starts, so this is how we learn them.)"""
        sid = payload.get("session_id")
        if sid and sid != info.session_id:
            info.session_id = sid
        path = payload.get("transcript_path")
        if path and isinstance(info, AgentInfo):
            info.transcript = str(path)

    def apply_tasks_gitignore(self) -> None:
        """tasks.in_git: the task files are committed with the project. Off puts a .gitignore in their folder,
        so the backlog stays on this machine."""
        folder = self.store.tasks.path
        if not folder.is_dir():
            return
        ignore = folder / ".gitignore"
        if self.config.tasks.in_git:
            if ignore.is_file() and ignore.read_text().startswith(TASKS_IGNORE_HEADER):
                ignore.unlink()
        elif not ignore.exists():
            ignore.write_text(TASKS_IGNORE_HEADER + "*\n")

    def _sync_session_record(self, task: Task, ended: bool = False) -> None:
        """Copy what we now know about the running agent into the task's session list (the task file keeps it)."""
        if not task.agent or not task.sessions:
            return
        record = task.sessions[-1]
        record.update(session_id=task.agent.session_id, transcript=task.agent.transcript)
        if ended and not record.get("ended_at"):
            record["ended_at"] = time.time()

    def _keep_transcript(self, task: Task) -> None:
        """Copy the finished session's transcript into the task's agent folder, so the record survives the tool's
        own history (agents.keep_transcripts). That folder is never in git."""
        if not self.config.agents.keep_transcripts or not task.agent or not task.sessions:
            return
        source = Path(task.agent.transcript or "")
        if not source.is_file():
            return
        folder = self.paths.transcripts_dir(task.id)
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / f"{task.agent.session_id or source.stem}{source.suffix or '.jsonl'}"
        try:
            shutil.copy2(source, target)
        except OSError as exc:
            self._emit("error", f"Could not copy the transcript of {task.id}: {exc}", task.id)
            return
        with self._lock:
            task.sessions[-1]["copy"] = str(target)
            self.save()

    def _manager_hook(self, event: str, payload: dict[str, Any]) -> None:
        m = self.state.manager
        if not m:
            return
        with self._lock:
            if event == "session-end" and not m.session_open:
                return   # we closed it ourselves (stop_manager); nothing more to do
            m.last_activity = time.time()
            self._track_session_id(m, payload)
            if event == "cleared":
                m.phase = "idle"
            elif event == "session-end":
                m.session_open = False
                m.phase = "ended"
                m.attention = ""
            elif event in ("idle", "busy"):
                m.phase = event
                if event == "busy":
                    m.attention = ""
            self.save()
        if event == "cleared":
            self._emit("manager", "Manager conversation cleared (/clear); the session stays up.")
        elif event == "session-end":
            self._emit("manager", "Manager session ended.")
            self._manager_closed_by_user()
        elif event == "idle":
            self._attend("manager", "waiting for your reply", when_idle=True)
        elif event == "notification":
            self._attend("manager", _attention_reason(payload))

    def _agent_hook(self, task: Task, event: str, payload: dict[str, Any]) -> None:
        agent = task.agent
        if not agent:
            return
        notify = None
        ended = event == "session-end"
        with self._lock:
            agent.last_activity = time.time()
            self._track_session_id(agent, payload)
            self._sync_session_record(task, ended=ended)
            if event == "cleared":
                agent.phase = "idle"
            elif event == "plan-approved" and task.status == TaskStatus.PLANNING:
                task.status = TaskStatus.WORKING
                agent.attention = ""
                notify = f"{task.id}: plan approved, agent is now implementing."
            elif event in ("idle", "busy"):
                agent.phase = event
                if event == "busy":
                    agent.attention = ""
            elif event == "session-end":
                agent.session_open = False
                agent.phase = "ended"
                agent.attention = ""
                agent.finished_at = time.time()
                if task.is_active:
                    task.status = TaskStatus.INTERRUPTED
                    notify = (f"{task.id} '{task.title}' was INTERRUPTED: its session ended before complete_task was called. "
                              "You can resume it with spawn_agent (it keeps its worktree and conversation).")
            task.touch()
            self.save()
        if ended:
            self._keep_transcript(task)
        if event == "plan-approved":
            self._emit("agent", notify or "", task.id)
        elif notify:
            self._emit("interrupted", notify, task.id, notify_manager=True)
            self._auto_dispatch()
        elif event == "idle" and task.is_active and not (task.status == TaskStatus.BLOCKED and agent.attention):
            self._attend(task.id, "plan ready — approve it" if task.status == TaskStatus.PLANNING
                         else "waiting for your reply", when_idle=True)
        elif event in ("notification", "permission") and task.is_active:
            self._attend(task.id, _attention_reason(payload, event))

    def plan_approved(self, task_id: str) -> Task:
        """A Codex agent has no plan mode: it calls this MCP tool once the user approved its plan in the chat."""
        task = self._task(task_id)
        if task.status != TaskStatus.PLANNING:
            raise OrchestratorError(f"{task.id} is {task.status}, not waiting for a plan approval.")
        self._agent_hook(task, "plan-approved", {})
        return task

    # -------------------------------------------------------------- attention
    def _attend(self, target: str, reason: str, when_idle: bool = False, tries: int = IDLE_RECHECKS) -> None:
        """Mark a session ("manager" or a task id) as waiting for the user and ring its tmux window once.

        `when_idle` means the session just ended a turn. That is not always the end of its work: a shell or a
        monitor it started in the background may still be running, and it will speak again by itself. In that
        case we stay quiet and look again in a few seconds."""
        if not reason:
            return
        with self._lock:
            info = self._session_info(target)
            if not info or not info.session_open or info.attention == reason:
                return
            if when_idle and self._still_working(info):
                info.phase = "busy"   # its turn ended, but it is working, not waiting for you
                self.save()
                if tries > 0:
                    threading.Timer(IDLE_RECHECK_SECONDS, self._attend_later, args=(target, reason, tries - 1)).start()
                return
            info.attention = reason
            self.save()
        self._emit("attention", f"{target} {reason}", None if target == "manager" else target)
        if self.config.notify.bell:
            try:
                self.tmux.ring(info.tmux_window)
            except TmuxError:
                pass

    def _attend_later(self, target: str, reason: str, tries: int) -> None:
        """The second look at a session that ended its turn while a background shell or monitor was still running."""
        info = self._session_info(target)
        if not info or not info.session_open:
            return
        if not self._still_working(info):
            with self._lock:
                info.phase = "idle"
                self.save()
        self._attend(target, reason, when_idle=True, tries=tries)

    def _still_working(self, info: ManagerInfo | AgentInfo) -> bool:
        """True while the session's own status line says work is still running (a background shell, a monitor, a
        turn in flight). Only the last lines are read: that is where both Claude Code and Codex put it."""
        try:
            pane = self.tmux.capture(info.tmux_window, 8)
        except TmuxError:
            return False
        return bool(BACKGROUND_WORK.search("\n".join(pane.splitlines()[-4:])))

    def pause_session(self, target: str) -> str:
        """Press Esc in a session ("manager" or a task id): Claude stops its current turn and waits for you."""
        info = self._session_info(target)
        if not info or not info.session_open or not self.tmux.window_alive(info.tmux_window):
            raise OrchestratorError(f"No live session for {target}.")
        self.tmux.send_keys(info.tmux_window, "Escape")
        with self._lock:
            info.attention = ""
            self.save()
        self._emit("agent" if target != "manager" else "manager", f"Paused {target} (Esc sent); it waits for your next message.",
                   None if target == "manager" else target)
        return target

    def acknowledge(self, target: str) -> None:
        """The user went to the session ("manager" or a task id): clear its bell."""
        with self._lock:
            info = self._session_info(target)
            if info and info.attention:
                info.attention = ""
                self.save()

    def _session_info(self, target: str) -> ManagerInfo | AgentInfo | None:
        if target == "manager":
            return self.state.manager
        if target.upper() in self.state.free_agents:
            return self.state.free_agents[target.upper()]
        task = self.state.tasks.get(target.upper())
        return task.agent if task else None

    # ---------------------------------------------------------------- manager
    def start_manager(self, resume: bool | None = None) -> ManagerInfo:
        self._require_tmux()
        with self._lock:
            if self.manager_alive():
                raise OrchestratorError("The manager is already running.")
            self._kill_old_manager()
            previous = self.state.manager
            want_resume = self.config.manager.resume if resume is None else resume
            do_resume = bool(want_resume and previous and previous.connected)
            session_id = previous.session_id if do_resume else launcher.new_session_id()
            pending = list(self.state.pending_manager_events)
            kickoff = prompts.manager_kickoff(pending, len(self.state.tasks))
            argv = launcher.manager_argv(self.config, self.paths, session_id, kickoff, do_resume,
                                         prompts.manager_prompt(self.config))
            self.tmux.ensure_session(self.paths.root)
            window = self.tmux.new_window(MANAGER_WINDOW, self.paths.root, argv, launcher.session_env(self.paths, None),
                                          first=True)
            self._auto_accept_dialogs(window)
            self.state.manager = ManagerInfo(session_id=session_id, tmux_window=window, rc_name=self.config.manager_rc_name())
            self._manager_resume_pending = do_resume
            if not do_resume:
                self.state.pending_manager_events.clear()
        self._emit("manager", f"Manager {'resumed' if do_resume else 'started'} (RC: {self.state.manager.rc_name}).")
        if do_resume and pending:
            self._deliver_to_manager(prompts.manager_kickoff(pending, len(self.state.tasks)))
        return self.state.manager

    def _kill_old_manager(self) -> None:
        """A previous manager (crashed dashboard, duplicate launch) must not survive next to the new one."""
        _pkill_claude(f"--mcp-config {re.escape(str(self.paths.home))}/manager/")
        if self.state.manager:
            self.tmux.kill_window(self.state.manager.tmux_window)
        if self.tmux.session_exists():
            while (wid := self.tmux.find_window(MANAGER_WINDOW)):
                self.tmux.kill_window(wid)

    def stop_manager(self) -> None:
        m = self.state.manager
        if not m:
            raise OrchestratorError("No manager session exists.")
        with self._lock:   # mark it closed first, so the session-end hook knows this was us, not the user
            m.session_open = False
            m.phase = "ended"
            self.save()
        self.tmux.kill_window(m.tmux_window)
        self._emit("manager", "Manager stopped.")

    def _manager_closed_by_user(self) -> None:
        """The manager chat was closed from inside (ctrl+c, /exit): take supermanager down with it if configured."""
        if self.config.manager.exit_closes_all:
            self.request_exit("manager chat closed")

    def request_exit(self, why: str = "quit requested") -> None:
        """Take supermanager down: agents back to the backlog, manager stopped, tmux workspace closed.
        Used by the manager's exit and by ctrl+c ctrl+c on any page."""
        if self.exit_requested:
            return
        self.exit_requested = why
        self._emit("manager", f"Stopping supermanager ({why}); agents go back to the backlog.")
        if self.on_exit_request:
            self.on_exit_request(why)

    def ensure_manager(self) -> None:
        if self.config.manager.autostart and not self.manager_alive():
            try:
                self.start_manager()
            except OrchestratorError as exc:
                self._emit("error", f"Could not start the manager: {exc}")

    def shutdown(self, stop_agents: bool = True) -> None:
        """Stop everything this project started: agents (requeued), manager, plus any stray leftovers."""
        for task in list(self.state.tasks.values()):
            if stop_agents and task.agent and task.agent.session_open:
                try:
                    self.stop_agent(task.id, requeue=True)
                except OrchestratorError:
                    pass
        for agent_id in list(self.state.free_agents):
            if stop_agents:
                self.stop_free_agent(agent_id)
        if self.manager_alive():
            self.stop_manager()
        self.kill_strays(agents=stop_agents)

    def kill_strays(self, agents: bool = True) -> int:
        """Kill Claude processes of this project that we no longer track (old runs, duplicates)."""
        home = re.escape(str(self.paths.home))
        patterns = [f"--mcp-config {home}/manager/"]
        if agents:
            patterns.append(f"--mcp-config {home}/agents/")
            patterns.append(f"--settings {home}/agents/")   # free agents have no MCP config
        killed = 0
        for pattern in patterns:
            killed += _pkill_claude(pattern)
        if self.tmux.session_exists():
            for name in ([MANAGER_WINDOW] if not agents else [MANAGER_WINDOW] + [t.id for t in self.state.tasks.values()]):
                wid = self.tmux.find_window(name)
                tracked = self._tracked_windows()
                if wid and wid not in tracked:
                    self.tmux.kill_window(wid)
        return killed

    def _tracked_windows(self) -> set[str]:
        wins = set()
        if self.state.manager and self.state.manager.session_open:
            wins.add(self.state.manager.tmux_window)
        for t in self.state.tasks.values():
            if t.agent and t.agent.session_open:
                wins.add(t.agent.tmux_window)
        wins.update(a.tmux_window for a in self.state.free_agents.values() if a.session_open)
        return wins

    def ask_manager_to_start(self, task_id: str) -> Task:
        """Type a request into the manager's chat so *it* dispatches the task (it never works on it itself)."""
        task = self._task(task_id)
        if task.status not in (TaskStatus.BACKLOG, TaskStatus.INTERRUPTED):
            raise OrchestratorError(f"{task.id} is {task.status}; only backlog or interrupted tasks can be started.")
        if not self.manager_alive():
            raise OrchestratorError("The manager is not running. Start it first, or use 'Spawn selected' to dispatch directly.")
        line = (f"[supermanager] The user asked (from the dashboard) to start task {task.id} '{task.title}' now. "
                f"Call spawn_agent(task_id=\"{task.id}\") immediately. Do not work on the task yourself; "
                "afterwards tell the user in one sentence that the agent started and how to approve its plan.")
        try:
            self.tmux.send_text(self.state.manager.tmux_window, line)
        except TmuxError as exc:
            raise OrchestratorError(f"Could not reach the manager window: {exc}") from exc
        self._emit("manager", f"Asked the manager to dispatch {task.id}.", task.id)
        return task

    def _deliver_to_manager(self, message: str) -> None:
        if not self.manager_alive():
            return
        status = self.status()
        nxt = self.next_backlog_task()
        tail = f" Free slots: {status['free_slots']}/{status['concurrency']}."
        tail += f" Next in backlog: {nxt.id} '{nxt.title}'." if nxt else " Backlog is empty."
        tail += " Call get_events for details, decide whether to spawn_agent, and tell the user."
        line = "[supermanager] " + " ".join(message.split()) + tail
        try:
            self.tmux.send_text(self.state.manager.tmux_window, line)
        except TmuxError:
            return
        with self._lock:
            if message in self.state.pending_manager_events:
                self.state.pending_manager_events.remove(message)
            self.save()

    def drain_events(self, limit: int = 30) -> list[dict[str, Any]]:
        with self._lock:
            self.state.pending_manager_events.clear()
            self.save()
            recent = self.state.events[-limit:]
        return [{"ts": e.ts, "kind": e.kind, "task_id": e.task_id, "message": e.message} for e in recent]

    def events_since(self, ts: float, limit: int = 100) -> list[dict[str, Any]]:
        """Events newer than ts (for the agents page, which runs in its own process)."""
        with self._lock:
            new = [e for e in self.state.events if e.ts > ts][-limit:]
        return [{"ts": e.ts, "kind": e.kind, "task_id": e.task_id, "message": e.message} for e in new]

    # ------------------------------------------------------------- reconcile
    def reconcile(self, startup: bool = False) -> None:
        """Compare what state.json believes with what tmux actually has; fix the differences.

        `startup`: a manager missing at boot is a leftover from an older run, not the user closing the chat.
        """
        changed = False
        with self._lock:
            m = self.state.manager
            if m and m.session_open and not self.tmux.window_alive(m.tmux_window):
                m.session_open = False
                m.phase = "ended"
                changed = True
                resume_failed = self._manager_resume_pending and time.time() - m.started_at < RESUME_GRACE_SECONDS
                self._close_dead_window(m.tmux_window, "manager", quiet=resume_failed)
                if resume_failed:
                    self._manager_resume_pending = False
                    self.save()
                    self._emit("manager", "Resume failed (old conversation not found); starting a fresh manager.")
                    m.connected = False
                    self.start_manager(resume=False)
                    return
                self.save()
                if not startup:
                    self._manager_closed_by_user()
                if self.exit_requested:
                    return
            for task in self.state.tasks.values():
                a = task.agent
                if a and a.session_open and not self.tmux.window_alive(a.tmux_window):
                    a.session_open = False
                    a.phase = "ended"
                    a.finished_at = time.time()
                    changed = True
                    self._close_dead_window(a.tmux_window, task.id)
                    if task.is_active:
                        task.status = TaskStatus.INTERRUPTED
                        self._emit("interrupted", f"{task.id} '{task.title}' was INTERRUPTED (its session is gone). "
                                   "spawn_agent resumes it.", task.id, notify_manager=True)
            for agent_id, a in list(self.state.free_agents.items()):
                if a.session_open and not self.tmux.window_alive(a.tmux_window):
                    a.session_open = False
                    changed = True
                    self._close_dead_window(a.tmux_window, agent_id)
                    del self.state.free_agents[agent_id]
            if changed:
                self.save()
        self._sweep_dead_windows()
        if startup:
            self.apply_tasks_gitignore()
            self.clean_worktrees()   # worktrees of tasks finished in an earlier run
        if changed:
            self._auto_dispatch()

    def _sweep_dead_windows(self) -> None:
        """Sessions that told us they ended (hook) still leave a dead pane behind once Claude exits: close those."""
        m = self.state.manager
        if m and not m.session_open and self.tmux.dead_status(m.tmux_window) is not None:
            self._close_dead_window(m.tmux_window, "manager", quiet=True)
        for task in self.state.tasks.values():
            a = task.agent
            if a and not a.session_open and self.tmux.dead_status(a.tmux_window) is not None:
                self._close_dead_window(a.tmux_window, task.id, quiet=True)
        for agent_id, a in list(self.state.free_agents.items()):
            if not a.session_open and self.tmux.dead_status(a.tmux_window) is not None:
                self._close_dead_window(a.tmux_window, agent_id, quiet=True)
                with self._lock:
                    del self.state.free_agents[agent_id]
                    self.save()

    def _close_dead_window(self, window_id: str, who: str, quiet: bool = False) -> None:
        """A finished Claude leaves a 'Pane is dead' window behind. Close it; keep its last lines if it crashed."""
        status = self.tmux.dead_status(window_id)
        tail = self.tmux.capture(window_id, 8).strip() if status else ""
        self.tmux.kill_window(window_id)
        if quiet and not status:
            return
        if status:
            self._emit("error", f"{who} session exited with status {status}. Last output: {tail[-300:]}",
                       None if who == "manager" else who)
        else:
            self._emit("manager" if who == "manager" else "agent", f"{who} session ended; its window was closed.",
                       None if who == "manager" else who)

    def screen(self, task_id: str | None, lines: int = 40) -> str:
        if task_id:
            task = self._task(task_id)
            return self.tmux.capture(task.agent.tmux_window, lines) if task.agent else ""
        m = self.state.manager
        return self.tmux.capture(m.tmux_window, lines) if m else ""

    def _auto_accept_dialogs(self, window_id: str, tool: str = "claude", seconds: int = 90) -> None:
        """New folders (every worktree) make Claude Code and Codex ask 'do you trust this folder?'. Answer yes."""
        if not self.config.agents.auto_trust:
            return
        dialogs = STARTUP_DIALOGS.get(tool, {})

        def session_up(pane: str) -> bool:   # the empty input prompt: no dialog will come any more
            if tool == "codex":
                return "Ask Codex" in pane
            return any(line.strip() == "❯" for line in pane.splitlines())

        def watch() -> None:
            deadline = time.time() + seconds
            while time.time() < deadline and self.tmux.window_alive(window_id):
                pane = self.tmux.capture(window_id, 60)
                keys = next((keys for marker, keys in dialogs.items() if marker in pane), None)
                if keys:
                    self.tmux.send_keys(window_id, *keys)
                    time.sleep(3)
                    continue
                if session_up(pane):
                    return
                time.sleep(1)

        threading.Thread(target=watch, daemon=True).start()

    def _require_tmux(self) -> None:
        if not Tmux.available():
            raise OrchestratorError("tmux is required to host Claude sessions. Install it: brew install tmux")


ATTENTION_REASONS = {
    "permission_prompt": "needs your permission",
    "elicitation_dialog": "asks you a question",
    "elicitation_url_dialog": "asks you to open a link",
    "agent_needs_input": "asks you a question",
    "idle_prompt": "waiting for your reply",
}


def _field_matches(stored: Any, wanted: str) -> bool:
    if isinstance(stored, list):
        return wanted in stored
    return str(stored or "").startswith(wanted)


def _session_record(agent: AgentInfo) -> dict[str, Any]:
    """One line of a task's history: which tool, which conversation, where its transcript is."""
    return {"tool": agent.tool, "model": agent.model, "effort": agent.effort, "session_id": agent.session_id,
            "rc_name": agent.rc_name, "cwd": agent.cwd, "branch": agent.branch, "transcript": agent.transcript,
            "copy": "", "started_at": agent.started_at, "ended_at": None}


def _attention_reason(payload: dict[str, Any], event: str = "notification") -> str:
    """Turn a Notification (Claude) or PermissionRequest (Codex) hook payload into a short 'why it needs you'
    text ('' = it does not)."""
    if event == "permission":
        return ATTENTION_REASONS["permission_prompt"]
    reason = ATTENTION_REASONS.get(str(payload.get("notification_type", "")))
    if not reason:
        return ""
    message = " ".join(str(payload.get("message", "")).split())
    return f"{reason}: {message[:80]}" if message else reason


def _pkill_claude(pattern: str) -> bool:
    """Kill only real `claude` processes whose command line matches; never shells or editors that mention the words."""
    found = subprocess.run(["pgrep", "-f", "--", pattern], capture_output=True, text=True).stdout.split()
    killed = False
    for pid in found:
        if int(pid) == os.getpid():
            continue
        command = subprocess.run(["ps", "-o", "command=", "-p", pid], capture_output=True, text=True).stdout.split()
        if any(tok.rsplit("/", 1)[-1] == "claude" for tok in command[:3]):
            try:
                os.kill(int(pid), signal.SIGTERM)
                killed = True
            except ProcessLookupError:
                pass
    return killed
