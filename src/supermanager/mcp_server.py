"""MCP bridge (stdio) that Claude sessions load. Manager and agents get different tool sets.

Every tool is a thin call to the daemon; the daemon owns all state. Open this to see what each role can do.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

try:  # mcp 2.x renamed FastMCP
    from mcp.server.mcpserver import MCPServer as FastMCP
except ImportError:  # mcp 1.x
    from mcp.server.fastmcp import FastMCP

from .client import DaemonClient, DaemonError, DaemonUnavailable
from .paths import ProjectPaths


def _ok(value: Any) -> str:
    return json.dumps(value, indent=2, default=str)


def build_server(project: Path, role: str, task_id: str | None) -> FastMCP:
    paths = ProjectPaths(project)
    client = DaemonClient(paths.socket)
    mcp = FastMCP("supermanager", instructions=f"supermanager bridge for role={role}"
                  + (f" task={task_id}" if task_id else ""))

    def call(op: str, **args: Any) -> str:
        try:
            return _ok(client.call(op, **args))
        except DaemonError as exc:
            return _ok({"error": str(exc)})
        except DaemonUnavailable as exc:
            return _ok({"error": f"supermanager daemon is not reachable: {exc}"})

    try:
        client.call("hello", role=role, task_id=task_id, session_id=None, timeout=3.0)
    except (DaemonError, DaemonUnavailable):
        pass

    if role == "manager":
        _register_manager_tools(mcp, call)
    else:
        _register_agent_tools(mcp, call, task_id or "")
    return mcp


def _register_manager_tools(mcp: FastMCP, call) -> None:
    @mcp.tool()
    def get_status() -> str:
        """Project overview: concurrency limit, free slots, worktree mode, manager state, task counts, backlog order."""
        return call("get_status")

    @mcp.tool()
    def list_tasks(status: str | None = None) -> str:
        """List tasks in backlog order. Optional status filter: backlog, planning, working, blocked, done, interrupted, cancelled."""
        return call("list_tasks", status=status)

    @mcp.tool()
    def get_task(task_id: str) -> str:
        """Full details of one task, including its agent, progress notes, result and branch."""
        return call("get_task", task_id=task_id)

    @mcp.tool()
    def create_task(title: str, problem: str, expected_outcome: str, acceptance_criteria: list[str],
                    verification: str, context: str = "", priority: str = "P2") -> str:
        """Add a task to the backlog. Rejected unless the problem is clearly described, expected_outcome is stated,
        acceptance_criteria are concrete and checkable, and verification says how to check (command or steps).
        If you lack any of these, ask the user before calling. priority: P0 (urgent) .. P3 (someday)."""
        return call("create_task", title=title, problem=problem, expected_outcome=expected_outcome,
                    acceptance_criteria=acceptance_criteria, verification=verification, context=context,
                    priority=priority)

    @mcp.tool()
    def update_task(task_id: str, title: str | None = None, problem: str | None = None,
                    expected_outcome: str | None = None, acceptance_criteria: list[str] | None = None,
                    verification: str | None = None, context: str | None = None, priority: str | None = None) -> str:
        """Edit fields of a task. Only the fields you pass are changed."""
        fields = {k: v for k, v in dict(title=title, problem=problem, expected_outcome=expected_outcome,
                                          acceptance_criteria=acceptance_criteria, verification=verification,
                                          context=context, priority=priority).items() if v is not None}
        return call("update_task", task_id=task_id, fields=fields)

    @mcp.tool()
    def reorder_backlog(ordered_task_ids: list[str]) -> str:
        """Set the dispatch order. Listed ids go first (in this order); unlisted tasks keep their relative order after them."""
        return call("reorder_backlog", ordered_ids=ordered_task_ids)

    @mcp.tool()
    def cancel_task(task_id: str, reason: str = "") -> str:
        """Mark a task as cancelled (it must not have a running agent)."""
        return call("cancel_task", task_id=task_id, reason=reason)

    @mcp.tool()
    def requeue_task(task_id: str) -> str:
        """Put a done/interrupted/cancelled task back at the top of the backlog."""
        return call("requeue_task", task_id=task_id)

    @mcp.tool()
    def spawn_agent(task_id: str | None = None, resume: bool | None = None) -> str:
        """Start an isolated Claude agent for a task (top backlog task if no id). Fails when no slot is free.
        resume=true continues an interrupted task's previous conversation and worktree."""
        return call("spawn_agent", task_id=task_id, resume=resume)

    @mcp.tool()
    def stop_agent(task_id: str, requeue: bool = False) -> str:
        """Kill a running agent. requeue=true puts the task back in the backlog, otherwise it becomes 'interrupted'."""
        return call("stop_agent", task_id=task_id, requeue=requeue)

    @mcp.tool()
    def close_agent_session(task_id: str) -> str:
        """Close the terminal session of a finished (done/interrupted) agent. Its worktree and branch stay."""
        return call("close_agent_session", task_id=task_id)

    @mcp.tool()
    def remove_worktree(task_id: str, force: bool = False) -> str:
        """Delete a finished task's worktree folder (the branch is kept). force=true discards uncommitted changes."""
        return call("remove_worktree", task_id=task_id, force=force)

    @mcp.tool()
    def get_events(limit: int = 30) -> str:
        """Recent events (done, blocked, interrupted, progress...). Also clears the 'pending' notification queue."""
        return call("get_events", limit=limit)

    @mcp.tool()
    def get_config() -> str:
        """All project settings with their current value, type and meaning (concurrency, worktrees, models...)."""
        return call("get_config")

    @mcp.tool()
    def set_config(key: str, value: str) -> str:
        """Change a project setting; use get_config to see the keys. Examples: agents.concurrency=5,
        agents.worktrees=true, agents.auto_dispatch=true, agents.model=opus. The user sees the change in the dashboard."""
        return call("set_config", key=key, value=value)


def _register_agent_tools(mcp: FastMCP, call, task_id: str) -> None:
    @mcp.tool()
    def get_task() -> str:
        """Your assignment: problem, expected outcome, acceptance criteria, verification steps and context."""
        return call("get_task", task_id=task_id)

    @mcp.tool()
    def report_progress(note: str) -> str:
        """Record a short progress note (a milestone reached, a decision made). Keep it to one or two sentences."""
        return call("report_progress", task_id=task_id, note=note)

    @mcp.tool()
    def block_task(question: str) -> str:
        """Tell the manager you cannot continue without a human decision. Then ask the user in the chat and wait."""
        return call("block_task", task_id=task_id, reason=question)

    @mcp.tool()
    def complete_task(summary: str, verification_notes: str) -> str:
        """Mark the task done. Only call this after every acceptance criterion is verified.
        summary: what changed, in plain language. verification_notes: evidence per criterion (commands run, results)."""
        return call("complete_task", task_id=task_id, summary=summary, verification_notes=verification_notes)


def run(project: Path, role: str, task_id: str | None) -> None:
    build_server(project, role, task_id).run(transport="stdio")
