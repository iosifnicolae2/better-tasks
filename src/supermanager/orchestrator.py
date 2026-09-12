"""The brain: backlog, slots, spawning agents, and telling the manager what happened.

Open this when a task's status, a slot count, or a manager notification is not what you expected.
"""

from __future__ import annotations

import os
import re
import signal
import subprocess
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from . import launcher, prompts, worktree
from .config import Config, save_config, set_key, settings_snapshot
from .models import ACTIVE_STATUSES, PRIORITIES, AgentInfo, Event, ManagerInfo, State, Task, TaskStatus
from .paths import ProjectPaths
from .store import StateStore
from .tmux import MANAGER_WINDOW, Tmux, TmuxError

EDITABLE_FIELDS = {"title", "problem", "expected_outcome", "acceptance_criteria", "verification", "context", "priority"}
RESUME_GRACE_SECONDS = 25
STARTUP_DIALOGS = ("Yes, I trust this folder", "Yes, I accept")  # both list "No" first, so Down+Enter picks Yes


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
        self._emit("config", f"Setting changed: {key} = {value}")
        if key in ("agents.concurrency", "agents.auto_dispatch"):
            self._auto_dispatch()
        return {"key": key, "value": value}

    def get_config(self) -> dict[str, dict]:
        return settings_snapshot(self.config)

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

    def create_task(self, title: str, problem: str, expected_outcome: str, acceptance_criteria: list[str],
                    verification: str, context: str = "", priority: str = "P2") -> Task:
        priority = (priority or "P2").upper()
        errors = self.validate_task(title, problem, expected_outcome, acceptance_criteria, verification, priority)
        if errors:
            raise OrchestratorError("Task is not clear enough yet. Ask the user, then fix: " + " ".join(errors))
        with self._lock:
            task_id = f"T-{self.state.next_task_number:03d}"
            self.state.next_task_number += 1
            task = Task(
                id=task_id, title=title.strip(), problem=problem.strip(), expected_outcome=expected_outcome.strip(),
                acceptance_criteria=[c.strip() for c in acceptance_criteria if c.strip()],
                verification=verification.strip(), context=(context or "").strip(), priority=priority,
            )
            self.state.tasks[task_id] = task
            self.state.order.append(task_id)
            self._sort_by_priority()
        self._emit("task", f"Created {task_id} [{priority}] {task.title}", task_id)
        self._auto_dispatch()
        return task

    def _sort_by_priority(self) -> None:
        """Stable sort: priority first, manual order second."""
        rank = {p: i for i, p in enumerate(PRIORITIES)}
        self.state.order.sort(key=lambda tid: rank.get(self.state.tasks[tid].priority, 9))

    def update_task(self, task_id: str, **fields: Any) -> Task:
        task = self._task(task_id)
        unknown = set(fields) - EDITABLE_FIELDS
        if unknown:
            raise OrchestratorError(f"Cannot edit {sorted(unknown)}. Editable: {sorted(EDITABLE_FIELDS)}")
        with self._lock:
            merged = {f: fields.get(f, getattr(task, f)) for f in EDITABLE_FIELDS}
            merged["priority"] = (merged["priority"] or "P2").upper()
            errors = self.validate_task(merged["title"], merged["problem"], merged["expected_outcome"],
                                        merged["acceptance_criteria"], merged["verification"], merged["priority"])
            if errors:
                raise OrchestratorError("Update rejected: " + " ".join(errors))
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
        return task

    def delete_task(self, task_id: str) -> None:
        task = self._task(task_id)
        if task.is_active:
            raise OrchestratorError(f"{task.id} has a running agent. Stop it first.")
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

    def list_tasks(self, status: str | None = None) -> list[Task]:
        tasks = [self.state.tasks[tid] for tid in self.state.order]
        if status:
            tasks = [t for t in tasks if t.status == status]
        return tasks

    # --------------------------------------------------------------- dispatch
    def spawn_agent(self, task_id: str | None = None, resume: bool | None = None) -> Task:
        self._require_tmux()
        with self._lock:
            task = self._task(task_id) if task_id else self.next_backlog_task()
            if not task:
                raise OrchestratorError("The backlog is empty; nothing to dispatch.")
            if task.is_active:
                raise OrchestratorError(f"{task.id} already has a running agent.")
            if task.status not in (TaskStatus.BACKLOG, TaskStatus.INTERRUPTED):
                raise OrchestratorError(f"{task.id} is {task.status}; requeue it first if you want it redone.")
            if self.free_slots() <= 0:
                raise OrchestratorError(
                    f"All {self.config.agents.concurrency} slots are busy. Wait for a task to finish or raise agents.concurrency.")

            cwd, wt_path, branch = self._prepare_workdir(task)
            can_resume = bool(task.agent and task.agent.session_id and task.agent.cwd == str(cwd))
            do_resume = can_resume if resume is None else (resume and can_resume)
            session_id = task.agent.session_id if do_resume else launcher.new_session_id()

            system_prompt = prompts.agent_prompt(self.config, task, str(wt_path) if wt_path else None, branch)
            argv = launcher.agent_argv(self.config, self.paths, task.id, session_id, prompts.agent_kickoff(task),
                                       do_resume, system_prompt)
            self.tmux.ensure_session(self.paths.root)
            window = self.tmux.new_window(task.id, cwd, argv, launcher.session_env(self.paths, task.id))
            self._auto_accept_dialogs(window)
            task.agent = AgentInfo(
                session_id=session_id, tmux_window=window, cwd=str(cwd), rc_name=self.config.agent_rc_name(task.id),
                worktree=str(wt_path) if wt_path else None, branch=branch,
            )
            task.status = TaskStatus.PLANNING
            task.blocked_reason = None
            task.touch()
        verb = "Resumed" if do_resume else "Started"
        where = f"worktree {branch}" if branch else "project root"
        self._emit("agent", f"{verb} agent for {task.id} in {where} (RC: {task.agent.rc_name}). Waiting for plan approval.", task.id)
        return task

    def _prepare_workdir(self, task: Task) -> tuple[Path, Path | None, str | None]:
        if not self.config.agents.worktrees:
            return self.paths.root, None, None
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
            if task.is_active:
                task.status = TaskStatus.BACKLOG if requeue else TaskStatus.INTERRUPTED
            task.touch()
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
            self.save()
            self._emit("agent", f"Closed the finished session of {task.id}.", task.id)
        return task

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
        if not self.config.agents.auto_dispatch:
            return
        while self.free_slots() > 0 and self.next_backlog_task():
            try:
                self.spawn_agent()
            except OrchestratorError as exc:
                self._emit("error", f"Auto-dispatch stopped: {exc}")
                return

    # ---------------------------------------------------------- agent reports
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

    def complete_task(self, task_id: str, summary: str, verification_notes: str) -> Task:
        task = self._task(task_id)
        with self._lock:
            task.status = TaskStatus.DONE
            task.blocked_reason = None
            task.result = {"summary": summary.strip(), "verification_notes": verification_notes.strip(), "ts": time.time()}
            if task.agent:
                task.agent.finished_at = time.time()
                task.agent.attention = ""
            task.touch()
        branch_note = ""
        if task.agent and task.agent.worktree:
            branch_note = f" Work is on branch {task.agent.branch} ({worktree.worktree_summary(self.paths.root, Path(task.agent.worktree))})."
        self._emit("done", f"{task.id} '{task.title}' is DONE.{branch_note} Summary: {summary.strip()[:400]}",
                   task.id, notify_manager=True)
        if self.config.agents.auto_close_done and task.agent:
            threading.Timer(20, self._safe_close, args=(task.id,)).start()
        self._auto_dispatch()
        return task

    def _safe_close(self, task_id: str) -> None:
        try:
            self.close_agent_session(task_id)
        except OrchestratorError:
            pass

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
        if role == "manager":
            self._manager_hook(event, payload)
        elif task_id and task_id.upper() in self.state.tasks:
            self._agent_hook(self.state.tasks[task_id.upper()], event, payload)

    def _manager_hook(self, event: str, payload: dict[str, Any]) -> None:
        m = self.state.manager
        if not m:
            return
        with self._lock:
            m.last_activity = time.time()
            if event == "session-end":
                m.session_open = False
                m.phase = "ended"
                m.attention = ""
            elif event in ("idle", "busy"):
                m.phase = event
                if event == "busy":
                    m.attention = ""
            self.save()
        if event == "session-end":
            self._emit("manager", "Manager session ended.")
        elif event == "idle":
            self._attend("manager", "waiting for your reply")
        elif event == "notification":
            self._attend("manager", _attention_reason(payload))

    def _agent_hook(self, task: Task, event: str, payload: dict[str, Any]) -> None:
        agent = task.agent
        if not agent:
            return
        notify = None
        with self._lock:
            agent.last_activity = time.time()
            if event == "plan-approved" and task.status == TaskStatus.PLANNING:
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
        if event == "plan-approved":
            self._emit("agent", notify or "", task.id)
        elif notify:
            self._emit("interrupted", notify, task.id, notify_manager=True)
            self._auto_dispatch()
        elif event == "idle" and task.is_active and not (task.status == TaskStatus.BLOCKED and agent.attention):
            self._attend(task.id, "waiting for your reply")
        elif event == "notification" and task.is_active:
            self._attend(task.id, _attention_reason(payload))

    # -------------------------------------------------------------- attention
    def _attend(self, target: str, reason: str) -> None:
        """Mark a session ("manager" or a task id) as waiting for the user and ring its tmux window once."""
        if not reason:
            return
        with self._lock:
            info = self._session_info(target)
            if not info or not info.session_open or info.attention == reason:
                return
            info.attention = reason
            self.save()
        self._emit("attention", f"{target} {reason}", None if target == "manager" else target)
        if self.config.notify.bell:
            try:
                self.tmux.ring(info.tmux_window)
            except TmuxError:
                pass

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
        self.tmux.kill_window(m.tmux_window)
        with self._lock:
            m.session_open = False
            m.phase = "ended"
            self.save()
        self._emit("manager", "Manager stopped.")

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
        if self.manager_alive():
            self.stop_manager()
        self.kill_strays(agents=stop_agents)

    def kill_strays(self, agents: bool = True) -> int:
        """Kill Claude processes of this project that we no longer track (old runs, duplicates)."""
        home = re.escape(str(self.paths.home))
        patterns = [f"--mcp-config {home}/manager/"]
        if agents:
            patterns.append(f"--mcp-config {home}/agents/")
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

    # ------------------------------------------------------------- reconcile
    def reconcile(self) -> None:
        """Compare what state.json believes with what tmux actually has; fix the differences."""
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
            if changed:
                self.save()
        self._sweep_dead_windows()
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

    def _auto_accept_dialogs(self, window_id: str, seconds: int = 90) -> None:
        """New folders (every worktree) make Claude Code ask 'do you trust this folder?'. Answer yes for it."""
        if not self.config.agents.auto_trust:
            return

        def watch() -> None:
            deadline = time.time() + seconds
            while time.time() < deadline and self.tmux.window_alive(window_id):
                pane = self.tmux.capture(window_id, 60)
                if any(marker in pane for marker in STARTUP_DIALOGS):
                    self.tmux.send_keys(window_id, "Down", "Enter")
                    time.sleep(3)
                    continue
                if any(line.strip() == "❯" for line in pane.splitlines()):  # empty input prompt: session is up
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


def _attention_reason(payload: dict[str, Any]) -> str:
    """Turn a Claude Code Notification hook payload into a short 'why it needs you' text ('' = it does not)."""
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
