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


def build_server(project: Path, role: str, task_id: str | None, tool: str = "claude") -> FastMCP:
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
        _register_agent_tools(mcp, call, task_id or "", tool)
    return mcp


def _register_manager_tools(mcp: FastMCP, call) -> None:
    @mcp.tool()
    def get_status() -> str:
        """Project overview: concurrency limit, free slots, worktree mode, manager state, task counts, backlog order,
        agent_defaults (the tool/model/effort an agent gets unless its task says otherwise) and task_fields
        (the extra fields this project's tasks carry, such as labels and scheduled)."""
        return call("get_status")

    @mcp.tool()
    def list_tasks(status: str | None = None, label: str | None = None,
                   field: str | None = None, value: str | None = None) -> str:
        """List tasks in backlog order. Filters, all optional: status (backlog, planning, working, blocked, done,
        interrupted, cancelled), label (one of a task's labels), or field+value for any other field the project
        defines — a list field matches when it contains the value, a text or date one when it starts with it
        (field="scheduled", value="2026-W38", or just "2026-09" for that month). get_config lists the fields."""
        return call("list_tasks", status=status, label=label, field=field, value=value)

    @mcp.tool()
    def get_task(task_id: str) -> str:
        """Full details of one task, including its agent, progress notes, result and branch."""
        return call("get_task", task_id=task_id)

    @mcp.tool()
    def create_task(title: str, problem: str, expected_outcome: str, acceptance_criteria: list[str],
                    verification: str, context: str = "", priority: str = "P2",
                    tool: str = "", model: str = "", effort: str = "", fields: dict | None = None) -> str:
        """Add a task to the backlog. Rejected unless the problem is clearly described, expected_outcome is stated,
        acceptance_criteria are concrete and checkable, and verification says how to check (command or steps).
        If you lack any of these, ask the user before calling. priority: P0 (urgent) .. P3 (someday).
        tool/model/effort pick what the agent runs with; leave them empty for the project defaults (get_status
        shows them). tool: claude or codex. effort: claude low/medium/high/xhigh/max, codex minimal/low/medium/high/xhigh.
        model must belong to the tool (e.g. opus for claude, gpt-6-astra for codex).
        fields carries the project's own fields, e.g. {"labels": ["api", "perf"], "scheduled": "2026-W38"};
        get_status / get_config name the ones this project defines. Ask the user for a label or a date only when
        they bring it up — otherwise leave fields out."""
        return call("create_task", title=title, problem=problem, expected_outcome=expected_outcome,
                    acceptance_criteria=acceptance_criteria, verification=verification, context=context,
                    priority=priority, tool=tool, model=model, effort=effort, fields=fields)

    @mcp.tool()
    def update_task(task_id: str, title: str | None = None, problem: str | None = None,
                    expected_outcome: str | None = None, acceptance_criteria: list[str] | None = None,
                    verification: str | None = None, context: str | None = None, priority: str | None = None,
                    tool: str | None = None, model: str | None = None, effort: str | None = None,
                    fields: dict | None = None) -> str:
        """Edit a task. Only what you pass is changed. tool/model/effort change what the agent will run with next
        time it starts ("" = back to the project default). fields sets the project's own fields, e.g.
        {"labels": ["api"], "scheduled": "2026-09-20"}; pass an empty value to clear one."""
        changes = {k: v for k, v in dict(title=title, problem=problem, expected_outcome=expected_outcome,
                                         acceptance_criteria=acceptance_criteria, verification=verification,
                                         context=context, priority=priority, tool=tool, model=model,
                                         effort=effort, fields=fields).items() if v is not None}
        return call("update_task", task_id=task_id, fields=changes)

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
    def spawn_agent(task_id: str | None = None, resume: bool | None = None,
                    tool: str | None = None, model: str | None = None, effort: str | None = None) -> str:
        """Start an isolated agent for a task (top backlog task if no id). Fails when no slot is free.
        resume=true continues an interrupted task's previous conversation and worktree.
        tool (claude|codex), model and effort override the task's / project's settings and are saved on the task."""
        return call("spawn_agent", task_id=task_id, resume=resume, tool=tool, model=model, effort=effort)

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
    def clean_worktrees(force: bool = False) -> str:
        """Free disk space: remove the worktrees of every done or cancelled task (their branches are kept) and
        forget the ones already gone. Worktrees with uncommitted changes are kept unless force=true — ask the
        user before using force. Returns what was removed and how much space came back."""
        return call("clean_worktrees", force=force)

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
        agents.worktrees=true, agents.auto_dispatch=true, agents.tool=codex, agents.model=opus, agents.effort=high.
        The user sees the change on the config page."""
        return call("set_config", key=key, value=value)


def _register_agent_tools(mcp: FastMCP, call, task_id: str, tool: str) -> None:
    @mcp.tool()
    def get_task() -> str:
        """Your assignment: problem, expected outcome, acceptance criteria, verification steps and context."""
        return call("get_task", task_id=task_id)

    if tool == "codex":   # Claude agents have plan mode; a hook reports the approval. Codex agents report it here.
        @mcp.tool()
        def plan_approved() -> str:
            """Call this once the user has explicitly approved your plan in the chat, right before you start
            changing files. Never call it before the user said yes."""
            return call("plan_approved", task_id=task_id)

    @mcp.tool()
    def update_plan(plan: str) -> str:
        """Write the plan into the task file (it replaces what is there). Call it as soon as your plan is approved,
        and again whenever the plan really changes — a step dropped, a different approach, extra work discovered.
        Keep it a short numbered list of steps a reader can follow."""
        return call("update_plan", task_id=task_id, plan=plan)

    @mcp.tool()
    def add_context(note: str) -> str:
        """Append something you learned to the task's Context: a constraint, a file that matters, a decision you
        made and why, a surprise in the code. One or two sentences; it stays in the task file for whoever reads
        it next (the user, the manager, or the agent that resumes this task)."""
        return call("add_context", task_id=task_id, note=note)

    @mcp.tool()
    def report_progress(note: str) -> str:
        """Record a short progress note (a milestone reached, a decision made). Keep it to one or two sentences.
        It is timestamped in the task's Progress log; use update_plan for the plan and add_context for findings."""
        return call("report_progress", task_id=task_id, note=note)

    @mcp.tool()
    def block_task(question: str) -> str:
        """Tell the manager you cannot continue without a human decision. Then ask the user in the chat and wait."""
        return call("block_task", task_id=task_id, reason=question)

    @mcp.tool()
    def complete_task(summary: str, verification_notes: str, merge: bool = False) -> str:
        """Mark the task done. Only call this after every acceptance criterion is verified, and after you asked the
        user whether to commit and merge your work into the base branch.
        summary: what changed, in plain language. verification_notes: evidence per criterion (commands run, results).
        merge: true only when the user answered yes — anything still uncommitted is committed and your branch is
        merged into the base branch. false leaves the branch alone. Your session closes shortly after either way."""
        return call("complete_task", task_id=task_id, summary=summary, verification_notes=verification_notes,
                    merge=merge)


def run(project: Path, role: str, task_id: str | None, tool: str = "claude") -> None:
    build_server(project, role, task_id, tool).run(transport="stdio")
