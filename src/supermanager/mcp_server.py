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
    elif role == "plan":
        _register_planner_tools(mcp, call, task_id or "", tool)
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
        """List tasks in backlog order. Filters, all optional: status (backlog, queued, planning, working, blocked, done,
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
                    tool: str = "", model: str = "", effort: str = "", fields: dict | None = None,
                    asked: str = "", autonomy: str = "", budget_tokens: int = 0, budget_usd: float = 0.0,
                    group: str = "", workdir: str = "", planning: str = "") -> str:
        """Add a task to the backlog. What happens next is agents.planning (get_config shows it): "planner" — a
        planning agent starts on the task by itself, reads the code, asks the user whatever is genuinely
        unclear and writes the plan onto the task; "agent" — one agent plans and works, in plan mode; "off" —
        no planning step, so call spawn_agent and the agent gets straight to work. Either way, create the task
        from what the user said instead of interviewing them first.
        Rejected unless the problem is clearly described, expected_outcome is stated, acceptance_criteria are
        concrete and checkable, and verification says how to check (command or steps); write those from what you
        know, and let the planner sharpen them. priority: P0 (urgent) .. P3 (someday).
        tool/model/effort pick what the agent runs with; leave them empty for the project defaults (get_status
        shows them). tool: claude or codex. effort: claude low/medium/high/xhigh/max, codex minimal/low/medium/high/xhigh.
        model must belong to the tool (e.g. opus for claude, gpt-6-astra for codex).
        fields carries the project's own fields, e.g. {"labels": ["api", "perf"], "scheduled": "2026-W38"};
        get_status / get_config name the ones this project defines. Ask the user for a label or a date only when
        they bring it up — otherwise leave fields out.
        asked: the user's own message, copied word for word, that led to this task. Always pass it; it is kept in
        the task's "Asked for" log so everyone can see what was actually requested, not only your reading of it.
        autonomy: how much this one task decides for itself — "auto" (it never asks: it plans, works and merges
        on its own), "ask" (it always asks, even when the project runs on auto), "" (follow the project).
        budget_tokens / budget_usd cap what this one task may spend over all its sessions; 0 (the usual) means
        the project's own cap applies. Set them only when the user puts a number on it ("keep this one under a
        dollar", "don't let it burn more than 500k tokens").
        group: a short name for one feature that falls into several tasks (e.g. "search-ui"). Give every task of
        that feature the same group: one agent does them in order, in one copy of the repo, on one branch
        sm/<group>, and the branch merges when the last of them is done — the whole group takes one slot. Use it
        whenever the tasks touch the same files or build on each other; leave it empty for independent tasks,
        which then run side by side with an agent each.
        workdir: where this task's agent works — "worktree" (its own copy of the repo, the default) or "project"
        (the project folder itself, on the branch you are on: nothing to merge). Leave empty for the project
        default (agents.workdir).
        planning: how much planning THIS task gets, whatever the project does — "planner" (a planning agent
        first), "agent" (one agent that plans in plan mode and waits for the user's approval), "off" (straight
        to work) or "" (the project's agents.planning, which is the normal case). Use it only for the reasons
        in your Planning section: on a project with planning off, set "planner" for a task the user agreed to
        have planned; set "off" when they say a task is trivial and should just be done."""
        return call("create_task", title=title, problem=problem, expected_outcome=expected_outcome,
                    acceptance_criteria=acceptance_criteria, verification=verification, context=context,
                    priority=priority, tool=tool, model=model, effort=effort, fields=fields, asked=asked,
                    autonomy=autonomy, budget_tokens=budget_tokens, budget_usd=budget_usd,
                    group=group, workdir=workdir, planning=planning)

    @mcp.tool()
    def record_request(task_id: str, text: str) -> str:
        """Add the user's own words to a task's "Asked for" log — word for word, not your summary. Call it every
        time the user says something more about a task: a correction, a detail, a change of mind."""
        return call("record_request", task_id=task_id, text=text)

    @mcp.tool()
    def update_task(task_id: str, title: str | None = None, problem: str | None = None,
                    expected_outcome: str | None = None, acceptance_criteria: list[str] | None = None,
                    verification: str | None = None, context: str | None = None, priority: str | None = None,
                    tool: str | None = None, model: str | None = None, effort: str | None = None,
                    fields: dict | None = None, autonomy: str | None = None, planning: str | None = None,
                    budget_tokens: int | None = None, budget_usd: float | None = None,
                    group: str | None = None, workdir: str | None = None) -> str:
        """Edit a task. Only what you pass is changed. tool/model/effort change what the agent will run with next
        time it starts ("" = back to the project default). autonomy: "auto" (this task decides everything by
        itself), "ask" (it always asks) or "" (follow the project). fields sets the project's own fields, e.g.
        {"labels": ["api"], "scheduled": "2026-09-20"}; pass an empty value to clear one.
        budget_tokens / budget_usd change what this task may spend in total (0 = back to the project's cap).
        Raising a budget a task already ran into lets its agent be started again.
        group puts this task with the others of one feature: they share a copy of the repo and a branch, and one
        agent does them in order (see create_task). Setting it on a backlog task while the group's agent is
        already running is fine — the next session takes it along. "" takes the task out of the group.
        workdir: "worktree" (its own copy of the repo) or "project" (the project folder itself, nothing to
        merge); "" follows the project default.
        planning: how much planning this task gets before it is worked — "planner", "agent", "off", or "" to
        follow the project (agents.planning). It applies to the next session started on the task, so setting
        "planner" on a task that has not run yet is what gets it a plan."""
        changes = {k: v for k, v in dict(title=title, problem=problem, expected_outcome=expected_outcome,
                                         acceptance_criteria=acceptance_criteria, verification=verification,
                                         context=context, priority=priority, tool=tool, model=model,
                                         effort=effort, fields=fields, autonomy=autonomy, planning=planning,
                                         budget_tokens=budget_tokens, budget_usd=budget_usd,
                                         group=group, workdir=workdir).items()
                   if v is not None}
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
                    tool: str | None = None, model: str | None = None, effort: str | None = None,
                    role: str | None = None) -> str:
        """Start a session on a task (the first queued or backlog task if no id). The kind is chosen for you:
        on a project that plans (agents.planning = planner) a planner while the task has no plan, then an agent
        that does the work — so this is how you start the work the user approved, and how you plan a task that
        had no plan (role="plan"), or re-plan when they want the plan redone.
        When every slot is busy the task is queued instead and starts by itself as soon as one frees; the
        returned status says which happened ("planning"/"working" = it started, "queued" = it is waiting).
        resume=true continues an interrupted task's previous conversation and worktree.
        tool (claude|codex), model and effort override the task's / project's settings and are saved on the task."""
        return call("spawn_agent", task_id=task_id, resume=resume, tool=tool, model=model, effort=effort, role=role)

    # ---- steering the running sessions. Every one of these takes a task (T-003), a free agent (A-001) and,
    # where it makes sense, "manager". Only do them when the user asks; an agent is not yours to interrupt.
    @mcp.tool()
    def pause_agent(task_id: str) -> str:
        """Press Esc in a running session ("p" on the tasks page): it stops what it is doing mid-turn and waits
        for the next message. task_id is a task (T-003), a free agent (A-001) or "manager". Use it when the
        user says "stop it for a moment", "pause T-003", "hold on" — the session and its work stay, and
        resume_agent sets it going again."""
        return call("pause_session", target=task_id)

    @mcp.tool()
    def resume_agent(task_id: str, text: str = "") -> str:
        """The other half of pause_agent: tell a paused or waiting session to carry on ("carry on", "continue
        T-003", "never mind, let it finish"). text is what to say to it, in the user's words — leave it empty
        to just let it pick up where it stopped. Read the answer with read_agent."""
        return call("resume_session", target=task_id, text=text)

    @mcp.tool()
    def stop_agent(task_id: str, requeue: bool = False) -> str:
        """Kill a running session for good ("X" on the tasks page). A task agent (T-003) leaves its task
        'interrupted', or back in the backlog with requeue=true; a free agent (A-001) is simply closed. Its
        branch and worktree stay either way, so spawn_agent(resume=true) can pick a task up later. When the
        user only wants it to hold still, that is pause_agent, not this."""
        return call("stop_session", target=task_id, requeue=requeue)

    @mcp.tool()
    def pause_all_agents() -> str:
        """Esc in every running agent at once — "pause everything", "everyone hold on". Nothing is closed and
        nothing is lost; resume_agent starts them again one by one. The manager and the user's own sessions
        are left alone."""
        return call("pause_all_agents")

    @mcp.tool()
    def stop_all_agents(requeue: bool = False) -> str:
        """Kill every running agent — "stop everything", "kill them all". Their tasks become 'interrupted', or
        go back to the backlog with requeue=true. Say what is running (list_agents) and let the user confirm
        before calling it; for a pause that keeps the work going, use pause_all_agents."""
        return call("stop_all_agents", requeue=requeue)

    @mcp.tool()
    def close_task(task_id: str) -> str:
        """Mark a task done as far as the user is concerned ("d" on the tasks page): a running agent is stopped,
        nothing is merged, its worktree is cleaned up as the project's on_finish says. Use it when the user says
        a task is finished, no longer needed as a task, or was done by hand."""
        return call("close_task", task_id=task_id)

    @mcp.tool()
    def delete_task(task_id: str) -> str:
        """Remove a task and its file for good ("x" on the tasks page). A running agent is stopped first. Only
        when the user asks to delete or remove it; cancel_task keeps the record."""
        return call("delete_task", task_id=task_id)

    @mcp.tool()
    def merge_task(task_id: str) -> str:
        """Commit what is left in a task's worktree and merge its branch `sm/<task-id>` into the working branch.
        For a task that finished without merging (on_finish = ask or notify): call it when the user says to merge
        it, never on your own."""
        return call("merge_task", task_id=task_id)

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
    def list_agents() -> str:
        """Every open session, as the agents page shows them: task agents (T-…, with their task's status), free
        agents (A-…), and the user's own sessions in this project (R-…, from the Claude app or a terminal; not
        yours to steer). Each with its phase (busy/idle), when it started, when it was last active, and what it
        waits on ("attention")."""
        return call("list_agents")

    @mcp.tool()
    def spawn_free_agent(tool: str | None = None, model: str | None = None, effort: str | None = None) -> str:
        """A plain session in the project root with no task ("n" on the agents page): the user wants a Claude or
        Codex to talk to directly, not a task worked. It gets an id A-001…; they open it on the agents page.
        tool (claude|codex), model and effort override the project defaults."""
        return call("spawn_free_agent", tool=tool, model=model, effort=effort)

    @mcp.tool()
    def stop_free_agent(agent_id: str) -> str:
        """Close a free agent's session (A-001…; "x" on the agents page). stop_agent does the same for any id,
        task or free; the user's own sessions (R-…) are theirs to close, not yours."""
        return call("stop_free_agent", agent_id=agent_id)

    @mcp.tool()
    def message_agent(task_id: str, text: str) -> str:
        """Say something to a running agent, in the user's words. Use it only when the user asks you to tell an
        agent something ("tell T-003 to skip the migration", "ask it why it changed the schema"); the agent reads
        it in its own chat and answers there, so follow up with read_agent. task_id is a task (T-003) or a free
        agent (A-001). It is also kept in that task's "Asked for" log."""
        return call("message_agent", target=task_id, text=text)

    @mcp.tool()
    def read_agent(task_id: str, lines: int = 40) -> str:
        """What a session's screen says right now — the last `lines` of it, up to 200. Use it to see what an
        agent answered, what it is asking for, or where it got stuck. Works for a task (T-003), a free agent
        (A-001) and "manager"."""
        return call("read_agent", target=task_id, lines=lines)

    @mcp.tool()
    def search_sessions(text: str, limit: int = 20, transcripts: bool = True) -> str:
        """Search across the sessions: what is on the running ones' screens, and what the finished ones wrote
        (their saved transcripts). Returns the matching lines and which session each came from. Use it to answer
        "did anyone touch the parser?" or "which agent mentioned the timeout?"."""
        return call("search_sessions", text=text, limit=limit, transcripts=transcripts)

    @mcp.tool()
    def get_spend() -> str:
        """What this project has cost so far: the whole total, the tasks that spent the most (with their
        budgets), the sessions with no task, and the manager — tokens and US dollars, counted from the
        sessions' own transcripts. Use it for "how much has this cost?", "what is the most expensive task?",
        "am I near the budget?". `priced: false` anywhere means part of that total ran on a model with no
        price here, so its dollars are a floor and its tokens are exact."""
        return call("get_spend")

    @mcp.tool()
    def get_events(limit: int = 30) -> str:
        """Recent events (done, blocked, interrupted, progress...). Also clears the 'pending' notification queue."""
        return call("get_events", limit=limit)

    @mcp.tool()
    def screen_off() -> str:
        """Turn the user's display off, now. Call it when they say something like "turn off the screen", "lights
        out" or "I'm going to bed" — nothing stops: this computer is kept awake (power.keep_awake) and the
        agents carry on. Pressing a key brings the screen back; a mouse move does not, and the screen goes
        straight out again (power.wake_with = anything accepts the mouse too, after a few seconds' grace).
        The bell goes quiet with the screen, so nothing beeps in a dark room; whatever needs them still shows
        on the agents page, and the bell comes back when they do. Never call it on your own initiative."""
        return call("screen_off")

    @mcp.tool()
    def get_config() -> str:
        """All project settings with their current value, type and meaning (concurrency, worktrees, models...)."""
        return call("get_config")

    @mcp.tool()
    def set_config(key: str, value: str) -> str:
        """Change a project setting; use get_config to see the keys. Examples: agents.concurrency=5,
        agents.workdir=worktree, agents.group_agent=true, agents.tool=codex, agents.model=opus, agents.effort=high,
        agents.on_finish=merge|ask|notify (what a finished task does), agents.skip_permissions,
        agents.planning=planner|agent|off (how much planning a task gets before it is worked — "off" starts
        the work directly), and the auto.* switches (auto.dispatch, auto.plan, auto.everything) that say which
        steps happen without the user. The user sees the change on the config page."""
        return call("set_config", key=key, value=value)


def _register_planner_tools(mcp: FastMCP, call, task_id: str, tool: str) -> None:
    """A planner reads and asks. It cannot change the project, so it has no tools that do."""

    @mcp.tool()
    def get_task() -> str:
        """The task you are planning: problem, expected outcome, acceptance criteria, verification, context,
        and "Asked for" — the user's own words, which outrank anyone's summary of them."""
        return call("get_task", task_id=task_id)

    @mcp.tool()
    def update_task(title: str | None = None, problem: str | None = None, expected_outcome: str | None = None,
                    acceptance_criteria: list[str] | None = None, verification: str | None = None,
                    context: str | None = None, priority: str | None = None) -> str:
        """Fix the task itself when reading the code showed it was wrong or vague: a sharper problem, acceptance
        criteria that can actually be checked, a verification command that exists in this project. Only what you
        pass is changed. Do not quietly change what the user asked for — if the goal itself is in question, ask
        them first."""
        changes = {k: v for k, v in dict(title=title, problem=problem, expected_outcome=expected_outcome,
                                         acceptance_criteria=acceptance_criteria, verification=verification,
                                         context=context, priority=priority).items() if v is not None}
        return call("update_task", task_id=task_id, fields=changes)

    @mcp.tool()
    def update_plan(plan: str) -> str:
        """Write the plan onto the task (it replaces what is there). Numbered steps, in order, naming the files
        and the commands; small enough to check off one by one. Say what you deliberately left out and what you
        are least sure about. This is what the agent that does the work will follow."""
        return call("update_plan", task_id=task_id, plan=plan)

    @mcp.tool()
    def add_context(note: str) -> str:
        """Append something the agent will need to the task's Context: a file that matters, a constraint, a
        decision and why, a surprise in the code, an assumption you had to make. One or two sentences."""
        return call("add_context", task_id=task_id, note=note)

    @mcp.tool()
    def record_request(text: str) -> str:
        """Add what the user just told you, word for word, to this task's "Asked for" log. Call it for every
        answer they give you, so the task keeps the request itself and not only your reading of it."""
        return call("record_request", task_id=task_id, text=text)

    @mcp.tool()
    def block_task(question: str) -> str:
        """Mark the task as needing a human decision before it can be planned at all. Use it only when you
        cannot write a sensible plan without an answer you could not get."""
        return call("block_task", task_id=task_id, reason=question)

    @mcp.tool()
    def finish_planning(approved: bool = True, note: str = "") -> str:
        """You are done: the plan is on the task. approved=true when the user said to start the work (or when
        nobody is asked on this project) — an agent picks the task up as soon as a slot frees. approved=false
        when they want to look first; the plan is kept and they can start it whenever they like.
        note: one line on what the plan does. Your session closes a few seconds after this — say nothing more."""
        return call("finish_planning", task_id=task_id, approved=approved, note=note)


def _register_agent_tools(mcp: FastMCP, call, task_id: str, tool: str) -> None:
    @mcp.tool()
    def get_task() -> str:
        """Your assignment: problem, expected outcome, acceptance criteria, verification steps, context, and the
        plan a planner already agreed with the user (follow it unless the code proves it wrong)."""
        return call("get_task", task_id=task_id)

    if tool == "codex":   # Claude agents have plan mode; a hook reports the approval. Codex agents report it here.
        @mcp.tool()
        def plan_approved() -> str:
            """Call this once the user has explicitly approved your plan in the chat, right before you start
            changing files. Never call it before the user said yes."""
            return call("plan_approved", task_id=task_id)

    @mcp.tool()
    def record_request(text: str) -> str:
        """Add what the user just told you, word for word, to this task's "Asked for" log. Call it whenever the
        user gives you an instruction or a correction in the chat, so the task keeps the request, not only your
        reading of it."""
        return call("record_request", task_id=task_id, text=text)

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
        """Report that the task is done — this is the one call that ends it. Only call it after every acceptance
        criterion is verified and your work is committed.

        What happens next is the project's decision, not yours (agents.on_finish), and the answer comes back to
        you: it either merges your branch into the base branch, removes your worktree and closes this session; or
        it merges nothing and tells the user what is ready and on which branch. When the project is set to ask,
        your prompt tells you to put the question to the user first, and `merge` carries their answer — leave it
        alone otherwise, it is ignored.
        summary: what changed, in plain language. verification_notes: evidence per criterion (commands run,
        results). Your session closes shortly after, either way."""
        return call("complete_task", task_id=task_id, summary=summary, verification_notes=verification_notes,
                    merge=merge)


def run(project: Path, role: str, task_id: str | None, tool: str = "claude") -> None:
    build_server(project, role, task_id, tool).run(transport="stdio")
