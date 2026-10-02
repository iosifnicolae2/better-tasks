"""The brain: backlog, slots, spawning agents, and telling the manager what happened.

Open this when a task's status, a slot count, or a manager notification is not what you expected.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import signal
import subprocess
import threading
import time
from collections.abc import Callable
from dataclasses import asdict, replace
from pathlib import Path
from typing import Any

from . import launcher, power, procs, prompts, taskfiles, upgrade, worktree
from .config import (AUTONOMY, ROLE_MODELS, TASK_PLANNING, WORKDIRS, Config, autonomy_for, canonical_key,
                     config_stamp, finish_mode, get_key, load_config, local_keys, model_for, planning_for,
                     save_config, set_key, settings_snapshot, skips_permissions, workdir_for)
from .launcher import AgentSettings
from .models import (ACTIVE_STATUSES, FINISHED_STATUSES, PRIORITIES, WAITING_STATUSES, AgentInfo, Event,
                     ManagerInfo, State, Task, TaskStatus)
from .paths import LID_MARKER, ProjectPaths
from .store import StateStore
from .tmux import AGENTS_WINDOW, CONFIG_WINDOW, DASHBOARD_WINDOW, MANAGER_WINDOW, REMOTE_WINDOW, Tmux, TmuxError
from . import usage

EDITABLE_FIELDS = {"title", "problem", "expected_outcome", "acceptance_criteria", "verification", "context", "plan",
                   "priority", "tool", "model", "effort", "autonomy", "planning", "group", "workdir",
                   "budget_tokens", "budget_usd"}
AGENT_SETTING_FIELDS = ("tool", "model", "effort")
RESUME_GRACE_SECONDS = 25
TASKS_IGNORE_HEADER = "# tasks.in_git is off: the backlog stays on this machine.\n"
SCREEN_POLL_SECONDS = 5      # how often we look to see whether the screen came back
SCREEN_GUARD_POLL = 0.5      # how often, once it is dark and we can see input without starting a process
SCREEN_QUIET = 2.0           # nothing touched for this long: the screen cannot have woken, so do not go and look
SCREEN_DARK_GRACE = 60       # how long the display has to actually go out before we stop expecting it to
LID_RECHECK_SECONDS = 60    # how long we trust what pmset last said about the lid (reconcile runs every 5s)
REMOTE_RETRY_SECONDS = 60   # how long to leave Remote Control alone before starting it again
IDLE_RECHECK_SECONDS = 20   # how long to wait before looking again at a session that ended its turn while busy
MANAGER_BOX_POLL = 2        # how often to look at the manager's chat box while a message waits for it to be free
MARK = "[supermanager]"     # what supermanager's own words are prefixed with, in every session it types into
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
        self._waiting_for_manager_box = False   # one watcher at a time, holding messages out of a typed line
        self._remote_started = 0.0
        self._awake: subprocess.Popen | None = None
        self._awake_closed = False   # what the holder process was started for, so a changed setting restarts it
        self._lid_told = ""          # the last lid complaint, so one unfixable setting is not said every few seconds
        self._lid_asked = (None, 0.0)   # (the setting we last looked for, when) — asking pmset costs a process
        self.screen_is_off = False
        self.on_exit_request: Callable[[str], None] | None = None   # set by the tasks page / headless loop
        self.exit_requested: str | None = None
        self._config_seen = config_stamp(paths.config)   # the files as they were when this config was read

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
        """Slots left for supermanager's own sessions. A slot is a session, not a task: one agent carrying a
        whole group takes one. A session you started yourself from the Claude app is yours, not ours: it is
        shown on the agents page but never takes a slot from the backlog."""
        busy = {t.agent.tmux_window for t in self.state.tasks.values() if t.is_active and t.agent}
        busy |= {a.tmux_window for a in self.state.free_agents.values() if a.session_open and a.role != "remote"}
        alone = sum(1 for t in self.state.tasks.values() if t.is_active and not t.agent)
        return max(0, self.config.agents.concurrency - len(busy) - alone)

    def remote_alive(self) -> bool:
        r = self.state.remote
        return bool(r and r.session_open and self.tmux.window_alive(r.tmux_window))

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
            "workdir": self.config.agents.workdir,
            "group_agent": self.config.agents.group_agent,
            "planning": self.config.agents.planning,   # planner, agent or off: how much planning a task gets
            "auto": {step: self.config.auto.on(step) for step in self.config.auto.STEPS},
            "tmux_session": self.config.tmux_session,
            "manager": None if not m else {
                "running": self.manager_alive(), "phase": m.phase, "rc_name": m.rc_name,
                "session_id": m.session_id, "connected": m.connected,
            },
            "remote_control": None if not self.state.remote else {
                "running": self.remote_alive(), "name": self.config.remote_name(),
                "spawn": self.config.remote.spawn,
            },
            "screen_off": self.screen_is_off,
            "task_counts": counts,
            "free_agents": sum(1 for a in self.state.free_agents.values() if a.session_open),
            "agent_defaults": {f: getattr(self.config.agents, f)
                               for f in (*AGENT_SETTING_FIELDS, *ROLE_MODELS.values())},
            "task_fields": [{"name": f.name, "type": f.type, "help": f.help} for f in self.config.task_fields()],
            "backlog_order": [tid for tid in self.state.order if self.state.tasks[tid].status == TaskStatus.BACKLOG],
            "pending_manager_events": len(self.state.pending_manager_events),
            "spent": _spent(usage.total([t.usage for t in self.state.tasks.values()]
                                        + [a.usage for a in self.state.free_agents.values()]
                                        + ([m.usage] if m else []))),
            "budget_per_task": {"tokens": self.config.agents.budget_tokens, "usd": self.config.agents.budget_usd,
                                "when_reached": self.config.agents.on_budget},
        }

    def set_config(self, key: str, value: str) -> dict[str, Any]:
        key = canonical_key(key)
        with self._lock:
            was = self.config.to_dict()
            try:
                set_key(self.config, key, value)
            except (KeyError, ValueError) as exc:
                raise OrchestratorError(str(exc)) from exc
            save_config(self.paths.config, self.config)
            self._config_seen = config_stamp(self.paths.config)   # our own write, not one to follow
            self._config_moved(was)
        message = f"Setting changed: {key} = {value}"
        if key in local_keys(self.paths.config):
            message += f" — but config.local.toml still overrides it ({get_key(self.config, key)} is what runs)."
        self._emit("config", message)
        self._config_applied(was)
        return {"key": key, "value": value}

    def follow_files(self) -> bool:
        """config.toml and the task files are also edited by hand, by the manager and by git: when they changed
        on disk since we last read or wrote them, take what they say now. True when something was picked up.
        The tasks page asks every second, so what you change in a file shows up about as fast as a key press."""
        return self._follow_config() | self._follow_tasks()

    def _follow_config(self) -> bool:
        stamp = config_stamp(self.paths.config)
        if stamp == self._config_seen:
            return False
        self._config_seen = stamp
        try:
            fresh = load_config(self.paths.config)
        except Exception as exc:   # a file mid-edit: keep what runs, say so once
            self._emit("error", f"config.toml could not be read ({exc}); the settings that were stay in force.")
            return False
        with self._lock:
            was = self.config.to_dict()
            if fresh.to_dict() == was:
                return False
            self.config = fresh
            self._config_moved(was)
        self._emit("config", "config.toml changed on disk; the settings were reloaded.")
        self._config_applied(was)
        return True

    def _config_moved(self, was: dict) -> None:
        """Under the lock, right after the config changed: the tasks folder follows tasks.path."""
        if self.config.tasks.path != was["tasks"]["path"]:
            self.store.relocate(self.state, self.paths.tasks_dir(self.config.tasks.path))
        if self.config.tasks.in_git != was["tasks"]["in_git"] or self.config.tasks.path != was["tasks"]["path"]:
            self.apply_tasks_gitignore()

    def _config_applied(self, was: dict) -> None:
        """After the config changed: what reacts to it — a free slot is filled, the machine kept awake or not."""
        now = self.config.to_dict()
        if now["agents"]["concurrency"] != was["agents"]["concurrency"] or now["auto"] != was["auto"]:
            self._auto_dispatch()
        if now["power"] != was["power"]:
            self.ensure_awake()

    def _follow_tasks(self) -> bool:
        with self._lock:
            try:
                changed = self.store.follow(self.state)
            except Exception as exc:   # one task file is broken or mid-edit: keep the tasks we have, say so once
                self._emit("error", f"A task file could not be read ({exc}); the tasks stay as they were.")
                return False
        return changed

    def get_config(self) -> dict[str, dict]:
        return settings_snapshot(self.config)

    def _agent_settings(self, task: Task | None = None, role: str = "", **overrides: str | None) -> AgentSettings:
        """Config defaults, then the task's own fields, then explicit overrides; validated.

        Which model the defaults give depends on the role: agents.plan_model for a planner, agents.work_model
        for the agent that does the work (config.model_for)."""
        values = {f: "" for f in AGENT_SETTING_FIELDS}
        for field in AGENT_SETTING_FIELDS:
            for value in (getattr(task, field, "") if task else "", overrides.get(field)):
                if value:
                    values[field] = str(value).strip()
        values["tool"] = values["tool"] or self.config.agents.tool
        values["model"] = values["model"] or model_for(self.config, role, values["tool"])
        values["effort"] = values["effort"] or self.config.agents.effort
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
                    asked: str = "", autonomy: str = "", budget_tokens: int = 0, budget_usd: float = 0.0,
                    group: str = "", workdir: str = "", planning: str = "") -> Task:
        priority = (priority or "P2").upper()
        autonomy = self._autonomy(autonomy)
        workdir = self._workdir(workdir)
        planning = self._planning(planning)
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
                fields=self._task_fields(fields), autonomy=autonomy, planning=planning, **settings,
                group=self._group(group), workdir=workdir,
                **_budget(budget_tokens, budget_usd),
            )
            if (asked or "").strip():
                task.requests.append({"ts": time.time(), "text": " ".join(asked.split())})
            self.state.tasks[task_id] = task
            self.state.order.append(task_id)
            self._sort_by_priority()
        self._emit("task", f"Created {task_id} [{priority}] {task.title}"
                           + (f" (group '{task.group}')" if task.group else ""), task_id)
        if task.group and self.config.agents.group_agent:
            # One piece of work, written as several tasks: nothing starts until the group is complete, so that
            # one agent gets all of it. spawn_agent on any of them says it is complete and starts it.
            self._auto_dispatch()
            return task
        if planning_for(self.config, task.planning) == "planner":
            try:
                self.spawn_agent(task.id, role="plan")   # queued instead when every slot is busy
            except OrchestratorError as exc:
                # The task is written and safe; only its planner could not start. Say so and leave it waiting.
                self._emit("error", f"Could not start the planner for {task.id}: {exc}", task.id)
        else:
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

    def _group(self, value: str | None) -> str:
        """A group name is also a folder and a branch (sm/<group>), so it keeps to letters, digits, - . _ ."""
        name = "-".join((value or "").strip().split())
        name = "".join(c if c.isalnum() or c in "-._" else "-" for c in name).strip("-.")
        return name[:40]

    def _workdir(self, value: str | None) -> str:
        """Where one task's agent works: "" (the project's agents.workdir), worktree or project."""
        value = (value or "").strip().lower()
        if value and value not in WORKDIRS:
            raise OrchestratorError(f"workdir must be one of: {', '.join(('(empty)', *WORKDIRS))}.")
        return value

    def _planning(self, value: str | None) -> str:
        """How much planning one task gets: "" (the project's agents.planning), planner, agent or off."""
        value = (value or "").strip().lower()
        if value not in TASK_PLANNING:
            raise OrchestratorError(f"planning must be one of: {', '.join(p or '(empty)' for p in TASK_PLANNING)}.")
        return value

    def _autonomy(self, value: str | None) -> str:
        """How much one task decides for itself: "" (follow the project), "auto" (everything) or "ask"."""
        value = (value or "").strip().lower()
        if value not in AUTONOMY:
            raise OrchestratorError(f"autonomy must be one of: {', '.join(a or '(empty)' for a in AUTONOMY)}.")
        return value

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
            merged["autonomy"] = self._autonomy(merged["autonomy"])
            merged["planning"] = self._planning(merged["planning"])
            merged["workdir"] = self._workdir(merged["workdir"])
            merged["group"] = self._group(merged["group"])
            merged.update(_budget(merged["budget_tokens"], merged["budget_usd"]))
            errors = self.validate_task(merged["title"], merged["problem"], merged["expected_outcome"],
                                        merged["acceptance_criteria"], merged["verification"], merged["priority"])
            if errors:
                raise OrchestratorError("Update rejected: " + " ".join(errors))
            self._agent_settings(None, **{f: merged[f] for f in AGENT_SETTING_FIELDS})
            for f, v in merged.items():
                setattr(task, f, v.strip() if isinstance(v, str) else v)
            if task.budget_hit and not self._over_budget(task):
                task.budget_hit = ""   # the budget was raised: it may spend again, and may be told again
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

    def place_task(self, task_id: str, before: str | None = None, after: str | None = None) -> None:
        """Put a task at one exact spot in the backlog: right above `before`, right below `after`, or last.

        This is what a card dropped on the board asks for, where a step of one (move_task) would land in the
        wrong place — the card next to it in a column can be many rows away in the backlog. It is also why a
        card let go at the foot of a column says `after` the last card there, instead of plain last: that
        column's foot is not the backlog's."""
        task = self._task(task_id)
        if task.id in (before, after):
            return
        with self._lock:
            order = self.state.order
            order.remove(task.id)
            if before in order:
                order.insert(order.index(before), task.id)
            elif after in order:
                order.insert(order.index(after) + 1, task.id)
            else:
                order.append(task.id)
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
            task.budget_hit = ""   # it is allowed to work again; the budget is looked at afresh
            task.touch()
            if task.id in self.state.order:
                self.state.order.remove(task.id)
            self.state.order.insert(0, task.id)
        self._emit("task", f"Requeued {task.id} at the top of the backlog", task.id)
        self._auto_dispatch()
        return task

    def next_backlog_task(self) -> Task | None:
        """The first backlog task that may start on its own. One whose plan is written but not approved is not
        one of them: it waits until you say go."""
        for tid in self.state.order:
            task = self.state.tasks[tid]
            if (task.status == TaskStatus.BACKLOG and not self.awaiting_approval(task)
                    and not self.group_busy(task) and not self.group_settling(task)):
                return task
        return None

    def next_queued_task(self) -> Task | None:
        """The first task you asked to start that is still waiting for a slot."""
        for tid in self.state.order:
            task = self.state.tasks[tid]
            if task.status == TaskStatus.QUEUED and not self.group_busy(task) and not self.group_settling(task):
                return task
        return None

    def group_busy(self, task: Task) -> bool:
        """True when this task's group already has an agent running and that agent is meant to do the whole
        group (agents.group_agent). Nothing starts by itself then: a second session in the same copy of the
        repo would edit the same files underneath the first one. The task waits, and the next session of the
        group takes it along. You can still start it by hand — spawn_agent says so plainly."""
        if not (self.config.agents.group_agent and task.group.strip()):
            return False
        return any(mate.is_active for mate in self.group_tasks(task))

    def group_settling(self, task: Task) -> bool:
        """True while this task's group is still being written. One request usually becomes several tasks, one
        after another; for agents.group_settle seconds after the newest of them, nothing starts the group by
        itself, so they go to one agent together instead of the first one running off alone. Starting it by
        hand says the group is complete and ignores this."""
        if not (self.config.agents.group_agent and task.group.strip() and self.config.agents.group_settle > 0):
            return False
        written = max(t.created_at for t in (task, *self.group_tasks(task)))
        return time.time() - written < self.config.agents.group_settle

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
    def _role_for(self, task: Task) -> str:
        """What a task needs next: a planner while it has no plan, then an agent that does the work. Only a
        task planned by a planning agent (planning = planner) ever gets one."""
        return "plan" if planning_for(self.config, task.planning) == "planner" and not task.plan.strip() else "work"

    def awaiting_approval(self, task: Task) -> bool:
        """Its plan is written but the user has not said go: nothing starts it by itself."""
        return bool(task.plan.strip()) and not task.plan_approved and task.status in WAITING_STATUSES

    def spawn_agent(self, task_id: str | None = None, resume: bool | None = None,
                    tool: str | None = None, model: str | None = None, effort: str | None = None,
                    queue: bool = True, role: str | None = None) -> Task:
        """Start a session on a task, or queue the task when every slot is busy (it then starts by itself as
        soon as one frees). The role is picked for you: a planner while the task has no plan (it reads the
        project, asks what is unclear and writes the plan onto the task), then an agent that does the work.
        tool/model/effort given here are saved on the task, then used."""
        self._require_tmux()
        with self._lock:
            task = self._task(task_id) if task_id else (self.next_queued_task() or self.next_backlog_task())
            if not task:
                raise OrchestratorError("The backlog is empty; nothing to dispatch.")
            if task.is_active:
                raise OrchestratorError(f"{task.id} already has a running agent.")
            if task.status not in WAITING_STATUSES:
                raise OrchestratorError(f"{task.id} is {task.status}; requeue it first if you want it redone.")
            if self._over_budget(task):
                limit_tokens, limit_usd = self.budget_of(task)
                raise OrchestratorError(
                    f"{task.id} has already spent its budget "
                    f"({usage.short(usage.tokens(task.usage))} tokens, "
                    f"{usage.money(float((task.usage or {}).get('cost', 0.0))) or '$0'}, allowed "
                    + " and ".join(p for p in (f"{usage.short(limit_tokens)} tokens" if limit_tokens else "",
                                               f"${limit_usd:,.2f}" if limit_usd else "") if p)
                    + "). Raise its budget (update_task) or the project's (agents.budget_tokens / "
                      "agents.budget_usd) before starting it again.")
            role = role or self._role_for(task)
            if self.group_busy(task):
                running = [m.id for m in self.group_tasks(task) if m.is_active]
                self._emit("agent", f"{task.id} starts a second session in the worktree of group "
                                    f"'{task.group}', next to {', '.join(running)}. Both agents edit the same "
                                    "files, so keep them on different parts of the work.", task.id)
            if self.free_slots() <= 0:
                if not queue:
                    raise OrchestratorError(f"All {self.config.agents.concurrency} slots are busy.")
                if task.status != TaskStatus.QUEUED:
                    task.status = TaskStatus.QUEUED
                    task.touch()
                    self.save()
                    what = "a planner" if role == "plan" else "an agent"
                    self._emit("task", f"{task.id} is queued: {what} starts on it as soon as one of the "
                                       f"{self.config.agents.concurrency} slots frees.", task.id)
                return task
            settings = self._agent_settings(task, role, tool=tool, model=model, effort=effort)
            for field, value in zip(AGENT_SETTING_FIELDS, (tool, model, effort)):
                if value:
                    setattr(task, field, value.strip())
            auto = autonomy_for(self.config, task.autonomy)
            planning = planning_for(self.config, task.planning)
            riders = self._riders(task)   # the rest of its group, when one agent is to do the whole piece of work

            if role == "plan":
                cwd, wt_path, branch = self._plan_workdir(task), None, None
            else:
                cwd, wt_path, branch = self._prepare_workdir(task)
                if task.plan.strip():
                    task.plan_approved = True   # starting the work is the approval
            previous = task.agent
            can_resume = bool(previous and previous.session_id and previous.cwd == str(cwd)
                              and previous.tool == settings.tool and previous.role == role)
            do_resume = can_resume if resume is None else (resume and can_resume)
            session_id = previous.session_id if do_resume else launcher.new_session_id() if settings.tool == "claude" else ""

            if role == "plan":
                system_prompt = prompts.planner_prompt(self.config, task, settings.tool, riders)
                argv = launcher.planner_argv(self.config, self.paths, task.id, cwd, settings, session_id,
                                             prompts.planner_kickoff(task, riders), do_resume, system_prompt)
            else:
                skip = skips_permissions(self.config, task.autonomy)
                plan_mode = (planning == "agent"
                             and not (skip or task.plan_approved or auto.on("plan")))
                system_prompt = prompts.agent_prompt(self.config, task, str(wt_path) if wt_path else None, branch,
                                                     settings.tool, self.base_branch(), plan_mode, riders)
                argv = launcher.agent_argv(self.config, self.paths, task.id, cwd, settings, session_id,
                                           prompts.agent_kickoff(task, riders), do_resume, system_prompt,
                                           plan_mode=plan_mode, skip=skip)
            self.tmux.ensure_session(self.paths.root)
            window = self.tmux.new_window(task.id, cwd, argv, launcher.session_env(self.paths, task.id, role="agent"))
            self._auto_accept_dialogs(window, settings.tool)
            rc_suffix = "-plan" if role == "plan" else ""
            task.agent = AgentInfo(
                session_id=session_id, tmux_window=window, cwd=str(cwd), role=role,
                rc_name=(self.config.agent_rc_name(task.id) + rc_suffix) if settings.tool == "claude" else "",
                worktree=str(wt_path) if wt_path else None, branch=branch,
                tool=settings.tool, model=settings.model, effort=settings.effort,
            )
            if do_resume and task.sessions:
                task.sessions[-1]["ended_at"] = None   # the same conversation continues
            else:
                task.sessions.append(_session_record(task.agent))
            working = role == "work" and (task.plan_approved or auto.on("plan") or planning == "off")
            task.status = TaskStatus.WORKING if working else TaskStatus.PLANNING
            task.blocked_reason = None
            task.touch()
            self._take_along(task, riders)
        verb = "Resumed" if do_resume else "Started"
        along = f" It carries {', '.join(t.id for t in riders)} as well." if riders else ""
        rc = f", RC: {task.agent.rc_name}" if task.agent.rc_name else ""
        if role == "plan":
            asks = "on its own" if auto.on("plan") else "and asks you what is unclear"
            self._emit("agent", f"{verb} a {settings.label()} planner for {task.id}{rc}. It reads the project "
                                f"{asks}, then writes the plan onto the task.{along}", task.id)
        else:
            where = f"worktree {branch}" if branch else "project root"
            how = ("It follows the approved plan." if task.plan_approved else
                   "There is no planning step here: it starts the work directly." if planning == "off" else
                   "It plans and implements on its own (auto.plan)." if auto.on("plan") else
                   "Waiting for plan approval.")
            self._emit("agent", f"{verb} {settings.label()} agent for {task.id} in {where}{rc}. {how}{along}", task.id)
        return task

    def _riders(self, task: Task) -> list[Task]:
        """The tasks of this task's group that its session takes along, so one agent does the whole piece of
        work in one copy of the repo (agents.group_agent). Empty unless the task names a group."""
        if not (self.config.agents.group_agent and task.group.strip()):
            return []
        return [mate for mate in self.group_tasks(task, WAITING_STATUSES)
                if not self._over_budget(mate) and not self.awaiting_approval(mate)]

    def _take_along(self, lead: Task, riders: list[Task]) -> None:
        """Put the riders on the session that was just started for the lead task: same window, same worktree,
        same branch. What the session spends is counted on the lead, so nothing is counted twice."""
        for mate in riders:
            mate.agent = replace(lead.agent, lead=lead.id, usage={}, transcript="")
            mate.status = lead.status
            mate.blocked_reason = None
            mate.sessions.append(_session_record(mate.agent))
            mate.touch()

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
            argv = launcher.free_agent_argv(self.config, self.paths, agent_id, settings, session_id,
                                            skip=skips_permissions(self.config))
            self.tmux.ensure_session(self.paths.root)
            window = self.tmux.new_window(agent_id, self.paths.root, argv,
                                          launcher.session_env(self.paths, agent_id, role="agent"))
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
            if info.role == "remote":
                raise OrchestratorError(f"{agent_id} is the user's own session ({_where(info)}); supermanager "
                                        "did not start it and does not stop it. They close it themselves.")
            self.tmux.kill_window(info.tmux_window)
            del self.state.free_agents[agent_id.upper()]
            self.save()
        self._emit("agent", f"Stopped agent {agent_id}.")

    def list_agents(self) -> list[dict[str, Any]]:
        """Every open session for the agents page: task agents (with their task's status) and free agents."""
        rows = [{"id": t.id, "title": t.title, "task": True, "status": str(t.status), "agent": _agent_row(t.agent)}
                for t in self.state.tasks.values() if t.agent and t.agent.session_open]
        rows += [{"id": aid, "task": False, "status": "", "agent": _agent_row(a),
                  "title": ("agent (no task)" if a.role != "remote"
                            else f"your session in a terminal ({a.tty})" if a.origin == "terminal"
                            else "your session from the Claude app")}
                 for aid, a in self.state.free_agents.items() if a.session_open]
        return rows

    def _free_agent_hook(self, agent_id: str, info: AgentInfo, event: str, payload: dict[str, Any]) -> None:
        with self._lock:
            info.last_activity = time.time()
            self._track_session_id(info, payload)
            self._count_usage(info)
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

    def _plan_workdir(self, task: Task) -> Path:
        """Where a planner reads: the checkout the task is about (its `repo` field) or the project itself.
        A planner never gets a worktree of its own — it changes nothing."""
        elsewhere = str(task.fields.get("repo") or "").strip()
        if elsewhere:
            path = Path(elsewhere).expanduser()
            if not path.is_dir():
                raise OrchestratorError(f"{task.id} says repo={elsewhere}, but there is no such folder.")
            return path
        return self.paths.root

    def _prepare_workdir(self, task: Task) -> tuple[Path, Path | None, str | None]:
        """Where this task's agent works, as (cwd, worktree, branch).

        A task in a group works in the group's copy of the repo, on the group's branch — the second task of a
        group finds the copy the first one made and works in it. `workdir = project` (or agents.workdir) puts
        the agent in the project folder itself, on the branch you are on: no copy, no branch, nothing to merge."""
        elsewhere = str(task.fields.get("repo") or "").strip()
        if elsewhere:
            path = Path(elsewhere).expanduser()
            if not path.is_dir():
                raise OrchestratorError(f"{task.id} says repo={elsewhere}, but there is no such folder.")
            return path, None, None   # another checkout: the agent works in it, we make no worktree there
        if workdir_for(self.config, task.workdir) == "project" or task.fields.get("conflict_for"):
            return self.paths.root, None, None   # a conflict is resolved where the branches meet: the checkout
        if not self.paths.is_git_repo():
            raise OrchestratorError("Worktrees are on but this folder is not a git repo. Run `git init`, or set "
                                    "agents.workdir=project to work in the project folder itself.")
        name = task.group.strip() or task.id
        branch = f"sm/{name}"
        path = self.paths.worktree_path(name)
        try:
            worktree.add_worktree(self.paths.root, path, branch, self.config.agents.worktree_base)
        except worktree.GitError as exc:
            raise OrchestratorError(f"Could not create worktree for {task.id}: {exc}") from exc
        return path, path, branch

    def group_tasks(self, task: Task, statuses: set[str] | None = None) -> list[Task]:
        """The other tasks of this task's group, in backlog order. Empty when it belongs to no group."""
        if not task.group.strip():
            return []
        order = {tid: i for i, tid in enumerate(self.state.order)}
        mates = [t for t in self.state.tasks.values()
                 if t.id != task.id and t.group.strip() == task.group.strip()
                 and (statuses is None or t.status in statuses)]
        return sorted(mates, key=lambda t: order.get(t.id, 999))

    def session_tasks(self, task: Task) -> list[Task]:
        """Every task the session that works on this one has been given, this one included.

        One agent can carry a whole group (agents.group_agent): the tasks share a window, a worktree and a
        branch, and the branch is merged when the last of them is done."""
        if not task.agent:
            return [task]
        lead = task.agent.lead or task.id
        crew = [t for t in self.state.tasks.values()
                if t.agent and (t.agent.lead or t.id) == lead and t.agent.tmux_window == task.agent.tmux_window]
        return crew or [task]

    def session_unfinished(self, task: Task) -> list[Task]:
        """The other tasks of this session that are not done yet: while there are any, its agent keeps working."""
        return [t for t in self.session_tasks(task) if t.id != task.id and t.status not in FINISHED_STATUSES]

    def group_unfinished(self, task: Task) -> list[Task]:
        """Tasks of the same group that are not finished. While there are any, the group's branch is not ready
        to merge: the work of the others is still to come on it."""
        return [t for t in self.group_tasks(task) if t.status not in FINISHED_STATUSES]

    def stop_agent(self, task_id: str, requeue: bool = False) -> Task:
        task = self._task(task_id)
        if not task.agent:
            raise OrchestratorError(f"{task.id} has no agent.")
        with self._lock:
            self.tmux.kill_window(task.agent.tmux_window)
            for mate in self.session_tasks(task):   # the window is shared when one agent carries a group
                mate.agent.session_open = False
                mate.agent.phase = "ended"
                mate.agent.finished_at = time.time()
                self._sync_session_record(mate, ended=True)
                if mate.is_active:
                    mate.status = TaskStatus.BACKLOG if requeue else TaskStatus.INTERRUPTED
                mate.touch()
        self._keep_transcript(task)
        self._emit("agent", f"Stopped agent for {task.id} (now {task.status}).", task.id)
        self._auto_dispatch()
        return task

    def close_agent_session(self, task_id: str) -> Task:
        task = self._task(task_id)
        if task.is_active:
            raise OrchestratorError(f"{task.id} is still active; use stop_agent instead.")
        still = [t.id for t in self.session_unfinished(task)]
        if still:
            raise OrchestratorError(f"The session of {task.id} is also working on {', '.join(still)}; "
                                    "it closes when the last of them is done.")
        if task.agent and task.agent.session_open:
            self.tmux.kill_window(task.agent.tmux_window)
            for mate in self.session_tasks(task):   # one window, one or several tasks on it
                mate.agent.session_open = False
                mate.agent.phase = "ended"
                self._sync_session_record(mate, ended=True)
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
        if self.group_unfinished(task):
            return 0   # the group's copy of the repo: the tasks still to come work in it
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
        auto.dispatch is on — with the top of the backlog."""
        while self.free_slots() > 0:
            task = self.next_queued_task() or (self.next_backlog_task() if self.config.auto.on("dispatch") else None)
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

    def changes_supermanager(self, task: Task) -> bool:
        """True when this task worked on supermanager's own checkout."""
        source = upgrade.source_dir()
        repo = str(task.fields.get("repo") or "").strip()
        return bool(source and repo and Path(repo).expanduser().resolve() == source)

    def complete_task(self, task_id: str, summary: str, verification_notes: str, merge: bool = False) -> Task:
        """An agent reports its task done. What happens next is the project's call, not the agent's
        (agents.on_finish): merge it and clean everything up, do what the user answered, or merge nothing and
        tell them what is ready."""
        task = self._task(task_id)
        mode = finish_mode(self.config, task.autonomy)
        if mode != "ask":
            merge = mode == "merge"
        merge = merge and bool(task.agent and task.agent.branch)
        # A group shares one branch: it is merged when the last of its tasks is done, not at the first one.
        to_come = self.group_unfinished(task)
        merge = merge and not to_come
        if self.changes_supermanager(task) and self.config.agents.reload_supermanager:
            ok, output = upgrade.smoke_test()
            if not ok:
                raise OrchestratorError(
                    "supermanager does not start with your change, so the task is not done and nothing was "
                    f"restarted. Fix this, run your verification again, then call complete_task once more:\n{output[-1500:]}")
        merged = self.merge_task(task_id) if merge else None
        with self._lock:
            task.status = TaskStatus.DONE
            task.blocked_reason = None
            task.result = {"summary": summary.strip(), "verification_notes": verification_notes.strip(),
                           "ts": time.time(), "finish": mode, "merged": merged}
            if task.agent:
                task.agent.finished_at = time.time()
                task.agent.attention = ""
            task.touch()
        branch_note = ""
        if to_come and task.agent and task.agent.branch:
            branch_note = (f" It is part of group '{task.group}': the work stays on {task.agent.branch}, which "
                           f"merges when {', '.join(t.id for t in to_come)} {'are' if len(to_come) > 1 else 'is'} "
                           "done too.")
        elif merged:
            branch_note = f" Merged into {merged['into']} ({merged['head']})."
        elif task.agent and task.agent.worktree:
            waiting = ("it is yours to merge when you like" if mode == "notify" else "not merged")
            branch_note = (f" Work is on branch {task.agent.branch} "
                           f"({worktree.worktree_summary(self.paths.root, Path(task.agent.worktree))}); {waiting}.")
        self._emit("done", f"{task.id} '{task.title}' is DONE.{branch_note} Summary: {summary.strip()[:400]}",
                   task.id, notify_manager=True)
        carries_on = self.session_unfinished(task)
        if task.agent and not carries_on:
            # The work is finished: close the session so its slot frees. The worktree, the branch and the
            # session record in the task file stay, so nothing is lost.
            self._keep_transcript(task)
            threading.Timer(self.config.agents.close_done_after, self._safe_close, args=(task.id,)).start()
        elif carries_on:
            # One agent, several tasks: this one is done, the session stays open for the rest of its group.
            self._emit("agent", f"{task.id} is done; its agent carries on with "
                                f"{', '.join(t.id for t in carries_on)} in the same worktree.", task.id)
        if self.changes_supermanager(task) and self.config.agents.reload_supermanager:
            # The code under this daemon changed and it starts: reload the workspace with it, once the finished
            # session has been closed. The agents keep running; only the daemon and the pages come back new.
            self._emit("agent", f"{task.id} changed supermanager itself; this workspace restarts with the new "
                                "code in a moment (agents keep running).", task.id, notify_manager=True)
            threading.Timer(self.config.agents.close_done_after + 5, self._reload_workspace, args=(task.id,)).start()
        self._auto_dispatch()
        return task

    def _reload_workspace(self, task_id: str) -> None:
        """Restart this workspace with the code as it is now. The check runs once more here: the agent may have
        touched something after it reported done, and a workspace that stays up on the old code is far better
        than one that cannot come back."""
        ok, output = upgrade.smoke_test()
        if not ok:
            self._emit("error", f"Did not restart for {task_id}: supermanager does not start with the code as it "
                                f"is now. This workspace keeps running the version it started with. {output[-400:]}",
                       task_id, notify_manager=True)
            return
        upgrade.restart_workspace(self.paths.root, task_id)

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
        elif not task_id:
            self._adopted_hook(event, payload)

    def _adopted_hook(self, event: str, payload: dict[str, Any]) -> None:
        """A Claude session someone started in this project that supermanager did not launch: from the phone
        through Remote Control, or by hand in a terminal. We have no window for it — we follow it through its
        hooks and its process, so that it shows up on the agents page like everything else (remote.adopt).

        The process is the identity: /clear gives Claude a new session id, but the same process — one row."""
        sid = str(payload.get("session_id") or "")
        pid = int(payload.get("pid") or 0)
        if not self.config.remote.adopt or not sid:
            return
        with self._lock:
            found = next(((aid, a) for aid, a in self.state.free_agents.items()
                          if a.session_id == sid or (pid and a.pid == pid)), None)
            if not found:
                if event in ("session-end", "cleared"):
                    return   # it ended before we ever saw it
                agent_id = f"R-{self.state.next_agent_number:03d}"
                self.state.next_agent_number += 1
                info = AgentInfo(session_id=sid, tmux_window="", cwd=str(payload.get("cwd") or self.paths.root),
                                 rc_name="", role="remote", phase="busy")
                self._place_adopted(info, pid)
                self.state.free_agents[agent_id] = info
                found = (agent_id, info)
                self.save()
                self._emit("agent", f"{agent_id}: a session was started in this project "
                           + ("from the Claude app." if info.origin == "app" else f"in a terminal ({info.tty})."))
            elif pid and not found[1].pid:
                self._place_adopted(found[1], pid)   # a row from before we followed processes
        agent_id, info = found
        self._free_agent_hook(agent_id, info, event, payload)
        if event == "session-end":
            with self._lock:
                self.state.free_agents.pop(agent_id, None)   # not ours: nothing to keep once it is gone
                self.save()

    def _place_adopted(self, info: AgentInfo, pid: int) -> None:
        """Where an adopted session runs, from its process: spawned by Remote Control (the Claude app) or in a
        terminal. Without a pid (an old hook) we assume the app, as before."""
        info.pid = pid
        if pid and not procs.under_remote_control(pid) and procs.tty_of(pid):
            info.origin, info.tty, info.rc_name = "terminal", procs.tty_of(pid), ""
        else:
            info.origin, info.tty, info.rc_name = "app", "", self.config.remote_name()
        started = procs.started_at(pid) if pid else None
        if started:
            info.started_at = started

    def _adopted_gone(self, info: AgentInfo) -> bool:
        """An adopted session has no window to watch: its process says whether it still runs. A row from before
        we followed processes is kept only while its transcript is fresh; its next hook brings the pid."""
        if info.pid:
            return not procs.alive(info.pid)
        transcript = Path(info.transcript) if info.transcript else None
        fresh = transcript and transcript.exists() and time.time() - transcript.stat().st_mtime < 600
        return not fresh

    @staticmethod
    def _track_session_id(info: ManagerInfo | AgentInfo, payload: dict[str, Any]) -> None:
        """Every hook carries the session's own id and transcript file: remember both. (/clear gives Claude a new
        session id, and a Codex session only tells us its id once it starts, so this is how we learn them.)"""
        sid = payload.get("session_id")
        if sid and sid != info.session_id:
            info.session_id = sid
        path = payload.get("transcript_path")
        if path:
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

    def _sync_session_record(self, task: Task, ended: bool = False) -> bool:
        """Copy what we now know about the running agent into the task's session list (the task file keeps it),
        its token count included. True when that count moved."""
        if not task.agent or not task.sessions:
            return False
        record = task.sessions[-1]
        moved = self._count_usage(task.agent)
        record.update(session_id=task.agent.session_id, transcript=task.agent.transcript,
                      usage=_spent(task.agent.usage))
        task.usage = usage.total([s.get("usage") for s in task.sessions])
        if ended and not record.get("ended_at"):
            record["ended_at"] = time.time()
        return moved

    # ------------------------------------------------------------------- what it all costs
    # Every tool writes the tokens of each request into its own transcript. We read the new lines of that file
    # (usage.py) and keep the running total on the session, on the task, and — added up — on the project.
    def _count_usage(self, info: ManagerInfo | AgentInfo) -> bool:
        """Bring one session's token count up to date from its transcript. Cheap: only the bytes written since
        the last look are read. True when there were some."""
        transcript = info.transcript or (usage.codex_transcript(info.session_id)
                                         if getattr(info, "tool", "") == "codex" else "")
        if transcript and transcript != info.transcript:
            info.transcript = transcript
        was = (info.usage or {}).get("offset", 0)
        info.usage = usage.read(transcript, info.usage, model=getattr(info, "model", ""),
                                prices=self.config.prices)
        return info.usage.get("offset", 0) != was

    def refresh_usage(self) -> None:
        """Count what every live session has spent, and act on a task that has spent what it was allowed.
        Called on every reconcile, so the numbers on the pages are never more than a few seconds old."""
        over, spent = [], False
        with self._lock:
            if self.state.manager and self.state.manager.session_open:
                spent |= self._count_usage(self.state.manager)
            for info in self.state.free_agents.values():
                if info.session_open and info.role != "remote":
                    spent |= self._count_usage(info)
            for task in self.state.tasks.values():
                if not (task.agent and task.agent.session_open) or task.agent.lead:
                    continue   # a task riding on another's session: what it spends is counted there
                spent |= self._sync_session_record(task)
                if self._over_budget(task) and not task.budget_hit:
                    over.append(task)
            if spent:   # nothing was written since the last look: leave the files alone
                self.save()
        for task in over:
            self._budget_reached(task)

    def budget_of(self, task: Task) -> tuple[int, float]:
        """What this task may spend: its own budget, or the project's where it does not say (0 = no ceiling)."""
        return (task.budget_tokens or self.config.agents.budget_tokens,
                task.budget_usd or self.config.agents.budget_usd)

    def _over_budget(self, task: Task) -> bool:
        limit_tokens, limit_usd = self.budget_of(task)
        spent = task.usage or {}
        return bool((limit_tokens and usage.tokens(spent) >= limit_tokens)
                    or (limit_usd and float(spent.get("cost", 0.0)) >= limit_usd))

    def _budget_reached(self, task: Task) -> None:
        """A task has spent its budget. agents.on_budget says what that means: tell the user and leave the
        agent working, press Esc so it stops and waits, or kill it. They are told either way."""
        mode = self.config.agents.on_budget
        limit_tokens, limit_usd = self.budget_of(task)
        spent = task.usage or {}
        allowed = " and ".join(part for part in (f"{usage.short(limit_tokens)} tokens" if limit_tokens else "",
                                                 f"${limit_usd:,.2f}" if limit_usd else "") if part)
        with self._lock:
            task.budget_hit = mode
            task.touch()
            self.save()
        told = (f"{task.id} has reached its budget ({allowed}): {usage.short(usage.tokens(spent))} tokens, "
                f"{usage.money(float(spent.get('cost', 0.0)), bool(spent.get('priced', True))) or '$0'} so far.")
        if mode == "pause":
            self._try_quietly(lambda: self.pause_session(task.id))
            told += " Its agent was paused; tell it to carry on (resume_agent) or raise the budget."
        elif mode == "stop":
            self._try_quietly(lambda: self.stop_agent(task.id))
            told += " Its agent was stopped; the task is interrupted and keeps its branch."
        else:
            told += " It is still working — raise the budget or stop it."
        self._emit("budget", told, task.id, notify_manager=True)
        self._attend(task.id, "over budget")

    def _try_quietly(self, act) -> None:
        """Do something to a session that may already be gone; a budget is not worth an error on the page."""
        try:
            act()
        except OrchestratorError as exc:
            self._emit("budget", str(exc))

    def spend(self, limit: int = 20) -> dict[str, Any]:
        """What this project has cost: the whole total, then the tasks that spent the most, then the sessions
        with no task (free agents and the manager). Money is in US dollars; `priced` false means part of it ran
        on a model with no price here, so the tokens are right and the cost is a floor."""
        self.refresh_usage()
        tasks = sorted((t for t in self.state.tasks.values() if usage.tokens(t.usage)),
                       key=lambda t: -float((t.usage or {}).get("cost", 0.0)))
        rows = [{"id": t.id, "title": t.title, "status": str(t.status), "sessions": len(t.sessions),
                 "budget_tokens": t.budget_tokens, "budget_usd": t.budget_usd, "budget_hit": t.budget_hit,
                 **_spent(t.usage)} for t in tasks[:limit]]
        loose = [{"id": aid, **_spent(a.usage)} for aid, a in self.state.free_agents.items() if usage.tokens(a.usage)]
        manager = _spent(self.state.manager.usage) if self.state.manager else {}
        every = [t.usage for t in tasks] + [a.usage for a in self.state.free_agents.values()]
        every += [self.state.manager.usage] if self.state.manager else []
        return {"project": _spent(usage.total(every)),
                "budget_per_task": {"tokens": self.config.agents.budget_tokens,
                                    "usd": self.config.agents.budget_usd,
                                    "when_reached": self.config.agents.on_budget},
                "tasks": rows, "free_agents": loose, "manager": manager}

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
            self._count_usage(m)
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

    @staticmethod
    def _stale_hook(task: Task, payload: dict[str, Any]) -> bool:
        """True when a hook comes from a session of this task that has already ended — its planner, say, whose
        window closes while the agent that does the work is starting. Acting on it would touch the wrong session."""
        sid = payload.get("session_id")
        if not sid or not task.agent or sid == task.agent.session_id:
            return False
        return any(s.get("session_id") == sid and s.get("ended_at") for s in task.sessions)

    def _agent_hook(self, task: Task, event: str, payload: dict[str, Any]) -> None:
        agent = task.agent
        if not agent or self._stale_hook(task, payload):
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
                gone = [t for t in self.session_tasks(task) if t.is_active and t.id != task.id]
                for mate in (task, *gone):   # one session can carry a whole group: all of it ended
                    mate.agent.session_open = False
                    mate.agent.phase = "ended"
                    mate.agent.attention = ""
                    mate.agent.finished_at = time.time()
                    if mate.is_active:
                        mate.status = TaskStatus.INTERRUPTED
                        mate.touch()
                if task.status == TaskStatus.INTERRUPTED:
                    also = f" It also carried {', '.join(t.id for t in gone)}, now interrupted too." if gone else ""
                    notify = (f"{task.id} '{task.title}' was INTERRUPTED: its session ended before complete_task was called. "
                              f"You can resume it with spawn_agent (it keeps its worktree and conversation).{also}")
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
            self._attend(task.id, "the planner needs you" if agent.role == "plan"
                         else "plan ready — approve it" if task.status == TaskStatus.PLANNING
                         else "waiting for your reply", when_idle=True)
        elif event in ("notification", "permission") and task.is_active:
            self._attend(task.id, _attention_reason(payload, event))

    def plan_approved(self, task_id: str) -> Task:
        """A Codex agent has no plan mode: it calls this MCP tool once the user approved its plan in the chat."""
        task = self._task(task_id)
        if task.agent and task.agent.role == "plan":
            raise OrchestratorError("You are the planner: write the plan with update_plan, then call finish_planning.")
        if task.status == TaskStatus.WORKING:
            return task   # it never waited for an approval (auto.plan, or a plan approved before it started)
        if task.status != TaskStatus.PLANNING:
            raise OrchestratorError(f"{task.id} is {task.status}, not waiting for a plan approval.")
        self._agent_hook(task, "plan-approved", {})
        return task

    def finish_planning(self, task_id: str, approved: bool = True, note: str = "") -> Task:
        """The planner is done. approved=true means the work may start (the user said go, or nobody was asked);
        approved=false leaves the task in the backlog with its plan, ready for whenever the user wants it.
        Either way the plan is kept and the planner's session closes a few seconds later."""
        task = self._task(task_id)
        if not task.plan.strip():
            raise OrchestratorError("There is no plan on the task yet. Call update_plan first, then finish_planning.")
        with self._lock:
            task.plan_approved = bool(approved)
            task.blocked_reason = None
            if task.agent:
                task.agent.attention = ""
            task.touch()
            self.save()
        what = ("approved — an agent starts on it." if approved else
                "waiting for you: it stays in the backlog until you start it.")
        self._emit("task", f"{task.id}: plan ready and {what} {note.strip()}".rstrip(), task.id, notify_manager=True)
        threading.Timer(self.config.agents.close_done_after, self._end_planning, args=(task.id,)).start()
        return task

    def _end_planning(self, task_id: str) -> None:
        """Close the planner's session — a few seconds later, so it can say its last line — and let the task
        move on: queued when its plan is approved, back in the backlog when it is not.

        A planner that plans a whole group writes one plan per task: its session stays open until the last of
        them has one."""
        task = self._task(task_id)
        if not task.agent or task.agent.role != "plan" or task.status != TaskStatus.PLANNING:
            return   # something else already took the task over
        with self._lock:
            task.status = TaskStatus.QUEUED if task.plan_approved else TaskStatus.BACKLOG
            task.touch()
            self.save()
        still = [t for t in self.session_tasks(task) if t.id != task.id and t.status == TaskStatus.PLANNING]
        if still:
            return   # the same planner is still writing the plan of the rest of the group
        try:
            self.close_agent_session(task.id)
        except OrchestratorError:
            pass
        self._auto_dispatch()

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
        if self.config.notify.bell and not (self.screen_is_off and self.config.notify.quiet_screen_off):
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

    # ------------------------------------------------------------- steering a session
    # One set of verbs for every session, whoever calls them (the pages, the CLI, the manager's tools):
    # pause it, set it going again, stop it for good — one at a time, or all of them at once.
    def _live_session(self, target: str) -> ManagerInfo | AgentInfo:
        """The session behind an id ("manager", T-003, A-001), or a plain refusal when there is none to steer."""
        info = self._session_info(target)
        if info and getattr(info, "role", "") == "remote":
            raise OrchestratorError(f"{target} is the user's own session ({_where(info)}); supermanager did not "
                                    "start it and does not steer it. Ask them instead.")
        if not info or not info.session_open or not self.tmux.window_alive(info.tmux_window):
            raise OrchestratorError(f"No live session for {target}. list_agents shows what is running.")
        return info

    def _type_into(self, target: str, info: ManagerInfo | AgentInfo, line: str) -> None:
        """Type a line into a session, as if the user had. It has something to do now, so its bell goes quiet."""
        try:
            self.tmux.send_text(info.tmux_window, line)
        except TmuxError as exc:
            raise OrchestratorError(f"Could not reach {target}: {exc}") from exc
        with self._lock:
            info.attention = ""
            self.save()

    def pause_session(self, target: str) -> str:
        """Press Esc in a session ("manager" or a task id): Claude stops its current turn and waits for you.
        Nothing is lost — the session, its worktree and its conversation stay; resume_session picks it up."""
        info = self._live_session(target)
        self.tmux.send_keys(info.tmux_window, "Escape")
        with self._lock:
            info.attention = ""
            self.save()
        self._emit("agent" if target != "manager" else "manager", f"Paused {target} (Esc sent); it waits for your next message.",
                   None if target == "manager" else target)
        return target

    def resume_session(self, target: str, text: str = "") -> dict[str, Any]:
        """The other half of pause_session: tell a paused or waiting session to carry on. `text` is what to say
        to it; without one it is simply asked to pick up where it stopped."""
        info = self._live_session(target)
        line = " ".join((text or "").split()) or "Carry on where you stopped."
        self._type_into(target, info, f"[supermanager] {line}")
        if target.upper() in self.state.tasks and text:
            self.record_request(target, text)
        self._emit("agent" if target != "manager" else "manager", f"Resumed {target}: {line[:120]}",
                   None if target == "manager" else target)
        return {"target": target, "sent": line}

    def stop_session(self, target: str, requeue: bool = False) -> dict[str, Any]:
        """Kill a session, whichever kind it is: a task's agent (T-003 — the task becomes interrupted, or goes
        back to the backlog with requeue=True) or a free agent (A-001, whose session is simply closed)."""
        target = (target or "").upper()
        if target == "MANAGER":
            raise OrchestratorError("The manager is not stopped from here; the user stops it themselves "
                                    "(`supermanager manager stop`, or m on the tasks page).")
        if target in self.state.free_agents:
            self.stop_free_agent(target)
            return {"target": target, "status": "closed"}
        task = self.stop_agent(target, requeue=requeue)
        return {"target": task.id, "status": str(task.status)}

    def steerable_sessions(self) -> list[str]:
        """Every live session supermanager started and may steer: task agents, then free agents. The manager
        and the user's own sessions (role "remote") are not in it."""
        ids = [t.id for t in self.state.tasks.values()
               if t.agent and t.agent.session_open and self.tmux.window_alive(t.agent.tmux_window)]
        ids += [aid for aid, a in self.state.free_agents.items()
                if a.role != "remote" and a.session_open and self.tmux.window_alive(a.tmux_window)]
        return ids

    def _to_each(self, act, verb: str) -> dict[str, Any]:
        """Do the same thing to every steerable session and report per id: one dead session must not stop the rest."""
        done, failed = [], {}
        for target in self.steerable_sessions():
            try:
                act(target)
                done.append(target)
            except OrchestratorError as exc:
                failed[target] = str(exc)
        self._emit("agent", f"{verb} {len(done)} session(s)." + (f" {len(failed)} would not." if failed else ""))
        return {"count": len(done), "sessions": done, "failed": failed}

    def pause_all_agents(self) -> dict[str, Any]:
        """Esc in every running agent at once ("pause everything"). Nothing is lost and nothing is closed."""
        return self._to_each(self.pause_session, "Paused")

    def stop_all_agents(self, requeue: bool = False) -> dict[str, Any]:
        """Kill every running agent ("stop everything"). Their tasks become interrupted, or go back to the
        backlog with requeue=True; the manager and the user's own sessions are left alone."""
        return self._to_each(lambda target: self.stop_session(target, requeue=requeue), "Stopped")

    def acknowledge(self, target: str) -> None:
        """The user went to the session ("manager" or a task id): clear its bell. They are plainly back, so a
        bell silenced with the screen comes on again."""
        self.screen_back("you are back")
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
                                         prompts.manager_prompt(self.config, upgrade.install()))
            self.tmux.ensure_session(self.paths.root)
            window = self.tmux.new_window(MANAGER_WINDOW, self.paths.root, argv,
                                          launcher.session_env(self.paths, None, role="manager"), first=True)
            self._auto_accept_dialogs(window)
            self.state.manager = ManagerInfo(session_id=session_id, tmux_window=window, rc_name=self.config.manager_rc_name())
            self._manager_resume_pending = do_resume
            if not do_resume:
                self.state.pending_manager_events.clear()
        self._emit("manager", f"Manager {'resumed' if do_resume else 'started'} (RC: {self.state.manager.rc_name}).")
        if do_resume and pending:
            with self._lock:
                self.state.pending_manager_events.clear()   # they go in the kickoff below, as one message
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

    # ----------------------------------------------------------------- power
    def ensure_awake(self) -> None:
        """Hold the machine awake while supermanager runs (power.keep_awake), with the lid shut too when
        power.awake_when_closed is on. The screen is not part of either: it may go black whenever it likes,
        and the work carries on.

        Called from every reconcile, so a setting changed on the config page takes effect within seconds."""
        if not self.config.power.keep_awake or self.exit_requested:
            self.let_sleep()
            return
        closed = self.config.power.awake_when_closed
        running = bool(self._awake and self._awake.poll() is None)
        if not running or self._awake_closed != closed:
            if running:
                self._awake.terminate()   # it was started for the other lid setting
            self._awake, self._awake_closed = power.start_keeping_awake(closed), closed
            if self._awake:
                self._emit("manager", "Keeping this computer awake while agents work (power.keep_awake).")
        self._ensure_lid(closed)

    def _ensure_lid(self, closed: bool) -> None:
        """macOS only: a shut lid sleeps whatever `caffeinate` says, so this is a machine-wide setting
        (`pmset disablesleep`) that needs root. Elsewhere the inhibitor started above already holds the lid
        switch, and there is nothing to do here.

        We only ever undo what we did: the marker file says supermanager turned it off, so a lid *you* set to
        stay awake is left alone, and one we set survives a crash — the next run puts it back."""
        if not power.is_mac():
            return
        asked_for, asked_at = self._lid_asked
        if closed == asked_for and time.time() < asked_at + LID_RECHECK_SECONDS:
            return                          # what pmset said a minute ago still holds; do not spawn it again
        self._lid_asked = (closed, time.time())
        now = power.lid_sleep_disabled()
        if now is None:
            return                          # this machine does not answer; leave its power settings alone
        if now == closed:
            self._lid_told = ""
            if not closed:
                LID_MARKER.unlink(missing_ok=True)   # someone put it back by hand: the marker is stale
            return
        if not closed:
            self._restore_lid()
            return
        problem = power.set_lid_sleep_disabled(True)
        if problem:
            if self._lid_told != problem:   # unfixable without a password: say it once, not every reconcile
                self._emit("manager", f"This laptop will still sleep when you shut the lid. {problem}")
                self._lid_told = problem
            return
        LID_MARKER.parent.mkdir(parents=True, exist_ok=True)
        LID_MARKER.write_text(f"{self.paths.root}\n")
        self._lid_told = ""
        self._emit("manager", "This laptop now keeps working with the lid shut (power.awake_when_closed); "
                              "it goes back to normal when supermanager stops.")

    def _restore_lid(self) -> None:
        """Put lid-close sleep back — but only when we are the ones who turned it off."""
        if not LID_MARKER.exists():
            return
        problem = power.set_lid_sleep_disabled(False)
        if problem:
            self._emit("error", f"This laptop still will not sleep with the lid shut. {problem}")
            return
        LID_MARKER.unlink(missing_ok=True)
        self._emit("manager", "This laptop sleeps with the lid shut again.")

    def let_sleep(self) -> None:
        """Let the machine sleep normally again — the holder process goes, and a lid we held goes back."""
        if self._awake and self._awake.poll() is None:
            self._awake.terminate()
        self._awake = None
        self._restore_lid()

    def screen_off(self) -> dict[str, Any]:
        """Black the display now. Nothing stops: the agents keep working.

        What brings it back is power.wake_with: a key press by default, and a mouse that only bumps the desk
        is ignored — we watch, and put the screen straight back out. With `anything` the mouse counts too,
        but only after power.mouse_grace seconds, so the hand you are still moving does not undo this.

        The bell goes quiet with the screen (notify.quiet_screen_off): nothing should beep in a dark room.
        Whatever needs you still shows on the agents page, and the bell comes back when you do."""
        message = power.screen_off(self.config.power.wake_with)
        went_out = "Screen off" in message
        quiet = went_out and self.config.notify.bell and self.config.notify.quiet_screen_off
        if went_out:
            with self._lock:
                self.screen_is_off = True
            if quiet:
                message += " The bell is off until you are back."
            threading.Thread(target=self._watch_the_dark, args=(time.time(),), daemon=True).start()
        self._emit("manager", message)
        return {"message": message, "bell": not quiet,
                "awake": bool(self._awake and self._awake.poll() is None)}

    def _watch_the_dark(self, since: float) -> None:
        """While the screen is off: put it back out when something we do not accept woke it, and notice when
        the user really is back — on macOS the display waking is what tells us.

        power.wake_with says what we accept (see `power.wake_allowed`). A machine that cannot tell a key from
        a mouse move accepts every wake, and waits instead for you to touch supermanager (acknowledge).

        While it is dark we ask CoreGraphics how long ago anything was touched, which starts no process, and
        only go and read the display's own state when something actually was."""
        cheap = power.input_idle() is not None
        dark_at = 0.0
        deadline = since + SCREEN_DARK_GRACE
        while self.screen_is_off and not self.exit_requested:
            time.sleep(SCREEN_GUARD_POLL if cheap and dark_at else SCREEN_POLL_SECONDS)
            if cheap and dark_at and (power.input_idle() or 0.0) > SCREEN_QUIET:
                continue      # nothing was touched, so nothing can have woken the screen
            here = power.user_is_here()
            if here is None:
                continue      # this machine cannot tell; acknowledge() brings the bell back
            if not here:
                dark_at = time.time()
                continue
            if not dark_at:   # it has not gone out yet, and at some point it never will
                if time.time() > deadline:
                    self.screen_back("the screen is on again")
                    return
                continue
            grace = since + max(0, self.config.power.mouse_grace)
            if power.wake_allowed(self.config.power.wake_with, dark_at, grace):
                self.screen_back("the screen is on again")
                return
            power.screen_off(self.config.power.wake_with)   # not a wake we accept: out it goes again

    def screen_back(self, why: str) -> None:
        """The user is back: stop guarding the screen, ring for them again, and say once what happened while
        it was quiet."""
        with self._lock:
            if not self.screen_is_off:
                return
            self.screen_is_off = False
            quiet = self.config.notify.bell and self.config.notify.quiet_screen_off
            waiting = [target for target, info in self._open_sessions() if info.attention]
        note = f" {len(waiting)} waiting for you: {', '.join(waiting)}." if waiting else ""
        self._emit("manager", f"{'The bell is back on' if quiet else 'The screen is yours again'} ({why}).{note}")

    # ------------------------------------------------------------------ pages
    def ensure_pages(self) -> None:
        """The agents and config pages are always there: `up` opens them, and this reopens one that is gone
        (its page crashed, or someone closed the window)."""
        if self.exit_requested or not self.tmux.session_exists():
            return
        for name, command in ((AGENTS_WINDOW, "agents-page"), (CONFIG_WINDOW, "config-page")):
            if self.tmux.find_window(name):
                continue
            try:
                self.tmux.new_window(name, self.paths.root,
                                     [*launcher.supermanager_argv(), command, "-C", str(self.paths.root)], {})
            except TmuxError as exc:
                self._emit("manager", f"Could not reopen the {name} page: {exc}")
                return
            self._emit("manager", f"The {name} page was closed; it is open again.")

    # --------------------------------------------------------- remote control
    def ensure_remote_control(self) -> None:
        """Keep `claude remote-control` up for this project, so the user can start a session in it from their
        phone. Called from reconcile, so it comes back if it dies."""
        if not self.config.remote.enabled or self.exit_requested or self.remote_alive():
            return
        if time.time() - self._remote_started < REMOTE_RETRY_SECONDS:
            return   # it was just started and is not up: give it a minute rather than respawning every check
        try:
            self.start_remote_control()
        except (OrchestratorError, TmuxError) as exc:
            self._emit("error", f"Could not start Remote Control: {exc}")

    def start_remote_control(self) -> ManagerInfo:
        """One `claude remote-control` server in its own window. The sessions it spawns are its own; they reach
        us through the hooks we put in the project (remote.adopt), which is what puts them on the agents page."""
        self._require_tmux()
        with self._lock:
            if self.state.remote:
                self.tmux.kill_window(self.state.remote.tmux_window)
            spawn = self.config.remote.spawn
            if spawn == "worktree" and not self.paths.is_git_repo():
                spawn = "same-dir"   # worktrees need git; a session in the folder itself is the next best thing
            if self.config.remote.adopt:
                launcher.write_project_hooks(self.paths)
            argv = launcher.remote_argv(self.config, spawn)
            self.tmux.ensure_session(self.paths.root)
            window = self.tmux.new_window(REMOTE_WINDOW, self.paths.root, argv,
                                          launcher.session_env(self.paths, None, role="session"))
            self.state.remote = ManagerInfo(session_id="", tmux_window=window, rc_name=self.config.remote_name())
            self._remote_started = time.time()
            self.save()
        self._emit("manager", f"Remote Control is up as '{self.config.remote_name()}': start a session in this "
                              f"project from claude.ai/code or the Claude app, and it appears on the agents page.")
        return self.state.remote

    def stop_remote_control(self) -> None:
        with self._lock:
            if self.state.remote:
                self.tmux.kill_window(self.state.remote.tmux_window)
                self.state.remote.session_open = False
                self.state.remote.phase = "ended"
                self.save()

    def ensure_manager(self) -> None:
        if self.config.manager.autostart and not self.manager_alive():
            try:
                self.start_manager()
            except OrchestratorError as exc:
                self._emit("error", f"Could not start the manager: {exc}")

    def shutdown(self, stop_agents: bool = True) -> None:
        """Stop everything this project started: agents (requeued), manager, Remote Control, plus any strays."""
        self.stop_remote_control()
        self.let_sleep()
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
        line = (f"{MARK} The user asked (from the dashboard) to start task {task.id} '{task.title}' now. "
                f"Call spawn_agent(task_id=\"{task.id}\") immediately. Do not work on the task yourself; "
                "afterwards tell the user in one sentence that the agent started and how to approve its plan.")
        try:
            if not self.tmux.chat_box_free(self.state.manager.tmux_window):
                raise OrchestratorError(
                    "The manager's chat cannot take this now: something is typed in its box, or it is showing "
                    "a dialog — sending would tack this onto your own half-written line. Send or clear it "
                    "(or answer the dialog), then press the key again. 'Spawn selected' starts the task "
                    "without going through the manager.")
            self.tmux.send_text(self.state.manager.tmux_window, line)
        except TmuxError as exc:
            raise OrchestratorError(f"Could not reach the manager window: {exc}") from exc
        self._emit("manager", f"Asked the manager to dispatch {task.id}.", task.id)
        return task

    def tell_manager(self, message: str) -> dict[str, Any]:
        """Say something to the manager from outside (the restart helper uses this)."""
        self._emit("manager", message, notify_manager=True)
        return {"delivered": self.manager_alive()}

    def _deliver_to_manager(self, message: str) -> None:
        """Tell the manager something by typing it into its chat — but never into a line the user is writing.

        The message goes on the pending queue first, and is typed out only while the chat box is empty. If the
        user has half a sentence in it, or a dialog is up, it waits there and a watcher delivers everything
        that piled up the moment the box is free — which is the moment they send their own message. Nothing is
        lost while it waits: the events page and get_events have it, and a manager that starts later reads the
        queue in its kickoff."""
        with self._lock:
            if message not in self.state.pending_manager_events:
                self.state.pending_manager_events.append(message)
            self.save()
        self._flush_to_manager()

    def _flush_to_manager(self) -> None:
        """Type everything waiting for the manager as one message, or set a watcher on a chat box that is busy."""
        if not self.manager_alive():
            return
        with self._lock:
            pending = list(self.state.pending_manager_events)
        if not pending:
            return
        window = self.state.manager.tmux_window
        try:
            if not self.tmux.chat_box_free(window):
                self._wait_for_manager_box()
                return
            self.tmux.send_text(window, self._manager_line(pending))
        except TmuxError:
            return
        with self._lock:
            self.state.pending_manager_events = [m for m in self.state.pending_manager_events if m not in pending]
            self.save()

    def _manager_line(self, pending: list[str]) -> str:
        """What waits for the manager, as one line, with where the project stands and what to do about it."""
        status = self.status()
        nxt = self.next_backlog_task()
        body = " · ".join(" ".join(m.split()) for m in pending)
        tail = f" Free slots: {status['free_slots']}/{status['concurrency']}."
        tail += f" Next in backlog: {nxt.id} '{nxt.title}'." if nxt else " Backlog is empty."
        tail += " Call get_events for details, decide whether to spawn_agent, and tell the user."
        return (body if body.startswith(MARK) else f"{MARK} {body}") + tail

    def _wait_for_manager_box(self) -> None:
        """Watch the manager's chat until the user has sent what they were typing (or cleared it), then
        deliver. One watcher does for every message waiting; it stops with the manager or with supermanager."""
        with self._lock:
            if self._waiting_for_manager_box:
                return
            self._waiting_for_manager_box = True

        def wait() -> None:
            try:
                while not self.exit_requested and self.manager_alive():
                    time.sleep(MANAGER_BOX_POLL)
                    manager = self.state.manager
                    if manager and self.tmux.chat_box_free(manager.tmux_window):
                        break
            except TmuxError:
                pass
            finally:
                with self._lock:
                    self._waiting_for_manager_box = False
            self._flush_to_manager()   # the box may have filled up again; then this sets the watcher anew

        threading.Thread(target=wait, daemon=True).start()

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
        """Compare what state.json believes with what tmux actually has; fix the differences. Also counts what
        the live sessions have spent, so the pages are never more than one round out of date.

        `startup`: a manager missing at boot is a leftover from an older run, not the user closing the chat.
        """
        self.refresh_usage()
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
                if a.role == "remote":
                    if self._adopted_gone(a):   # not ours: no window here, so its process says if it still runs
                        del self.state.free_agents[agent_id]
                        changed = True
                        self._emit("agent", f"{agent_id} ended (its session is gone).")
                    continue
                if a.session_open and not self.tmux.window_alive(a.tmux_window):
                    a.session_open = False
                    changed = True
                    self._close_dead_window(a.tmux_window, agent_id)
                    del self.state.free_agents[agent_id]
            if changed:
                self.save()
        self._sweep_dead_windows()
        self.ensure_pages()
        self.ensure_remote_control()
        self.ensure_awake()
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
            if a.role == "remote":
                continue
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
            info = self._session_info(task_id)
            return self.tmux.capture(info.tmux_window, lines) if info else ""
        m = self.state.manager
        return self.tmux.capture(m.tmux_window, lines) if m else ""

    # ------------------------------------------------------- talking to agents
    def message_agent(self, target: str, text: str) -> dict[str, Any]:
        """Type a line into an agent's session, as the manager relaying what the user said.

        The agent sees it in its chat like anything else you type there, so it answers there; watch the reply
        with read_agent. A task agent also keeps the line in its task's "Asked for" log."""
        text = " ".join((text or "").split())
        if not text:
            raise OrchestratorError("Pass the message to send.")
        info = self._live_session(target)
        self._type_into(target, info, f"[supermanager] From the user, through the manager: {text}")
        if target.upper() in self.state.tasks:
            self.record_request(target, text)
        self._emit("agent", f"Sent to {target}: {text[:120]}", target if target != "manager" else None)
        return {"target": target, "sent": text}

    def read_agent(self, target: str, lines: int = 40) -> dict[str, Any]:
        """The last lines of a session's screen, as they are right now."""
        info = self._session_info(target)
        if not info:
            raise OrchestratorError(f"No session for {target}.")
        if getattr(info, "role", "") == "remote":
            raise OrchestratorError(f"{target} is a session the user started themselves ({_where(info)}). "
                                    "It has no window here, so there is no screen to read; ask them instead.")
        return {"target": target, "phase": info.phase, "attention": info.attention,
                "screen": self.tmux.capture(info.tmux_window, max(5, min(int(lines), 200)))}

    def search_sessions(self, text: str, limit: int = 20, transcripts: bool = True) -> dict[str, Any]:
        """Look for something across the sessions: what is on their screens now, and what the finished ones
        wrote (their transcripts). Returns the matching lines with the session they came from."""
        needle = (text or "").strip().lower()
        if len(needle) < 3:
            raise OrchestratorError("Give at least three characters to search for.")
        hits: list[dict[str, Any]] = []
        for target, info in self._open_sessions():
            for line in self.tmux.capture(info.tmux_window, 200).splitlines():
                if needle in line.lower():
                    hits.append({"where": target, "source": "screen", "line": " ".join(line.split())[:200]})
                    if len(hits) >= limit:
                        return {"query": text, "hits": hits, "more": True}
        if transcripts:
            for path in sorted(self.paths.agents_dir.glob("*/transcripts/*.jsonl")):
                for line in _matching_lines(path, needle):
                    hits.append({"where": path.parent.parent.name, "source": path.name, "line": line[:200]})
                    if len(hits) >= limit:
                        return {"query": text, "hits": hits, "more": True}
        return {"query": text, "hits": hits, "more": False}

    def _open_sessions(self) -> list[tuple[str, AgentInfo | ManagerInfo]]:
        rows: list[tuple[str, AgentInfo | ManagerInfo]] = []
        if self.state.manager and self.state.manager.session_open:
            rows.append(("manager", self.state.manager))
        rows += [(t.id, t.agent) for t in self.state.tasks.values() if t.agent and t.agent.session_open]
        rows += [(aid, a) for aid, a in self.state.free_agents.items() if a.session_open]
        return rows

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


QUOTED_NOTIFICATIONS = {"agent_needs_input", "elicitation_dialog", "elicitation_url_dialog"}
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


def _matching_lines(path: Path, needle: str, budget: int = 4_000_000) -> list[str]:
    """What a transcript says around `needle`. A transcript is JSON per line, so the matching sentence is dug
    out of it; the read is capped so a huge file cannot stall the daemon."""
    out = []
    try:
        with path.open(errors="replace") as f:
            read = 0
            for line in f:
                read += len(line)
                if read > budget:
                    break
                if needle in line.lower():
                    out.append(_readable(line, needle))
    except OSError:
        return []
    return out


def _readable(line: str, needle: str) -> str:
    """The sentence that matched, not the JSON around it."""
    try:
        found: list[str] = []
        _strings(json.loads(line), needle, found)
        if found:
            return _around(min(found, key=len), needle)
    except (ValueError, RecursionError):
        pass
    return " ".join(line.split())


def _around(text: str, needle: str, width: int = 160) -> str:
    """The needle with some of its sentence around it, not a page of transcript."""
    flat = " ".join(text.split())
    at = flat.lower().find(needle)
    if at < 0 or len(flat) <= width:
        return flat[:width]
    start = max(0, at - width // 3)
    return ("…" if start else "") + flat[start:start + width] + ("…" if start + width < len(flat) else "")


def _strings(value: Any, needle: str, found: list[str]) -> None:
    if isinstance(value, str):
        if needle in value.lower():
            found.append(value)
    elif isinstance(value, dict):
        for item in value.values():
            _strings(item, needle, found)
    elif isinstance(value, list):
        for item in value:
            _strings(item, needle, found)


def _where(info: AgentInfo) -> str:
    """Where a session the user started themselves runs, for a message."""
    return f"in their terminal, {info.tty}" if info.origin == "terminal" else "from the Claude app"


def _session_record(agent: AgentInfo) -> dict[str, Any]:
    """One line of a task's history: which tool, which conversation, where its transcript is."""
    return {"tool": agent.tool, "model": agent.model, "effort": agent.effort, "session_id": agent.session_id,
            "rc_name": agent.rc_name, "cwd": agent.cwd, "branch": agent.branch, "transcript": agent.transcript,
            "copy": "", "usage": {}, "started_at": agent.started_at, "ended_at": None}


def _agent_row(agent: AgentInfo) -> dict[str, Any]:
    """One session as the agents page and the manager see it: everything it holds, with what it spent tidied
    up — the reading cursor is ours, not theirs."""
    return {**asdict(agent), "usage": _spent(agent.usage)}


def _budget(tokens, dollars) -> dict[str, Any]:
    """A budget as a task stores it. 0 means "whatever the project allows"; below zero is not a ceiling."""
    try:
        return {"budget_tokens": max(0, int(tokens or 0)), "budget_usd": max(0.0, float(dollars or 0))}
    except (TypeError, ValueError) as exc:
        raise OrchestratorError(f"A budget is a number of tokens and an amount in dollars: {exc}") from exc


def _spent(counted: dict | None) -> dict[str, Any]:
    """What a session or a task spent, as it is written down and handed out: the counts, the cost, and
    whether every model in it had a price. The reading cursor stays out of it."""
    counted = counted or {}
    out = {name: int(counted.get(name, 0)) for name in usage.COUNTS}
    return {**out, "tokens": usage.tokens(counted), "cost": round(float(counted.get("cost", 0.0)), 4),
            "priced": bool(counted.get("priced", True))}


def _attention_reason(payload: dict[str, Any], event: str = "notification") -> str:
    """Turn a Notification (Claude) or PermissionRequest (Codex) hook payload into a short 'why it needs you'
    text ('' = it does not)."""
    if event == "permission":
        return ATTENTION_REASONS["permission_prompt"]
    kind = str(payload.get("notification_type", ""))
    reason = ATTENTION_REASONS.get(kind)
    if not reason:
        return ""
    # A question is worth quoting; "Claude Code needs your approval to run a command" only repeats the reason,
    # and a row on a page has no room for that.
    message = " ".join(str(payload.get("message", "")).split())
    return f"{reason}: {message[:60]}" if message and kind in QUOTED_NOTIFICATIONS else reason


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
