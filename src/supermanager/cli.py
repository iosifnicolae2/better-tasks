"""Command-line entry point (`supermanager` / `sm`). Open this to see every subcommand."""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

import typer
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from . import __version__
from .client import DaemonClient, DaemonError, DaemonUnavailable
from .config import SETTABLE_KEYS, Config, load_config, save_config, set_key
from .models import State
from .paths import ProjectPaths, find_project_root
from .store import StateStore

app = typer.Typer(help="A manager Claude that plans a backlog and dispatches isolated Claude agents.",
                  add_completion=False, no_args_is_help=False, rich_markup_mode="rich")
manager_app = typer.Typer(help="Start or stop the manager Claude session.")
config_app = typer.Typer(help="Show or change project settings.")
app.add_typer(manager_app, name="manager")
app.add_typer(config_app, name="config")
console = Console()

PROJECT_OPT = typer.Option(None, "--project", "-C", help="Project folder (default: found from the current dir).")


def _paths(project: Optional[Path]) -> ProjectPaths:
    root = project.resolve() if project else find_project_root()
    return ProjectPaths(root)


def _require_config(paths: ProjectPaths) -> Config:
    if not paths.config.exists():
        console.print(f"[red]No supermanager config in {paths.root}.[/red] Run [bold]supermanager init[/bold] first.")
        raise typer.Exit(1)
    return load_config(paths.config)


def _client(paths: ProjectPaths) -> DaemonClient:
    return DaemonClient(paths.socket)


def _call(paths: ProjectPaths, op: str, **args):
    try:
        return _client(paths).call(op, **args)
    except DaemonUnavailable:
        console.print("[red]supermanager is not running for this project.[/red] Start it with [bold]supermanager up[/bold].")
        raise typer.Exit(1)
    except DaemonError as exc:
        console.print(f"[red]{exc}[/red]")
        raise typer.Exit(1)


def _load_state(paths: ProjectPaths) -> State:
    config = load_config(paths.config)
    return StateStore(paths.state, paths.tasks_dir(config.tasks.path)).load()


# ---------------------------------------------------------------------------------------------- root
@app.callback(invoke_without_command=True)
def root(ctx: typer.Context, project: Optional[Path] = PROJECT_OPT,
         version: bool = typer.Option(False, "--version", help="Print version and exit.")):
    if version:
        console.print(f"supermanager {__version__}")
        raise typer.Exit()
    if ctx.invoked_subcommand is None:
        up(project=project, headless=False, no_attach=False, dashboard=False)


@app.command()
def init(project: Optional[Path] = PROJECT_OPT,
         concurrency: Optional[int] = typer.Option(None, help="How many agents may run at once."),
         worktrees: Optional[bool] = typer.Option(None, help="Give each agent its own git worktree."),
         yes: bool = typer.Option(False, "-y", help="Accept defaults without asking.")):
    """Create .supermanager/config.toml in this project (asks a few questions)."""
    paths = _paths(project)
    if paths.config.exists():
        console.print(f"Config already exists at {paths.config}. Edit it or use `supermanager config set`.")
        raise typer.Exit()
    config = Config(project_name=paths.root.name)
    if not yes:
        config.project_name = typer.prompt("Project name", default=config.project_name)
        if concurrency is None:
            concurrency = typer.prompt("Max agents running at once", default=config.agents.concurrency, type=int)
        if worktrees is None:
            worktrees = typer.confirm("Give each agent its own git worktree (recommended, needs git)?", default=True)
    config.agents.concurrency = concurrency or config.agents.concurrency
    config.agents.worktrees = True if worktrees is None else worktrees
    paths.ensure_layout()
    save_config(paths.config, config)
    console.print(Panel.fit(
        f"Created [bold]{paths.config}[/bold]\n\n"
        f"concurrency = {config.agents.concurrency}   worktrees = {config.agents.worktrees}\n"
        f"Manager RC name: [cyan]{config.manager_rc_name()}[/cyan]\n\n"
        "Next: run [bold]supermanager[/bold] to open the manager chat; [bold]ctrl+a[/bold] cycles through the pages.",
        title="supermanager", border_style="green"))
    if not (paths.root / "CLAUDE.md").exists():
        console.print("[yellow]Tip:[/yellow] this project has no CLAUDE.md. The manager and agents read it for "
                      "conventions and test commands; consider running `claude` and `/init`.")


@app.command()
def up(project: Optional[Path] = PROJECT_OPT,
       headless: bool = typer.Option(False, help="Run the daemon in this terminal, no tmux, no dashboard."),
       no_attach: bool = typer.Option(False, "--no-attach", help="Start everything but stay in this shell."),
       dashboard: bool = typer.Option(False, "--dashboard", "-d", help="Open the tasks page instead of the manager chat.")):
    """Start everything and drop you into the manager chat (default command)."""
    paths = _paths(project)
    if paths.root in (Path.home().resolve(), Path("/")):
        console.print("[red]Run supermanager inside a project folder[/red] (or pass -C <folder>), not in your home directory.")
        raise typer.Exit(1)
    if not paths.config.exists():
        _auto_init(paths)
    config = load_config(paths.config)
    paths.ensure_layout()
    if headless:
        from .orchestrator import Orchestrator
        asyncio.run(_run_headless(Orchestrator(paths, config)))
        return

    from .daemon import is_daemon_running
    from .launcher import supermanager_argv
    from .tmux import AGENTS_WINDOW, CONFIG_WINDOW, DASHBOARD_WINDOW, KEY, MANAGER_WINDOW, Tmux, inside_tmux_session
    if not Tmux.available():
        console.print("[red]tmux is required[/red] (it hosts the Claude sessions): brew install tmux")
        raise typer.Exit(1)
    tmux = Tmux(config.tmux_session)

    if not is_daemon_running(paths.socket):
        argv = [*supermanager_argv(), "dashboard", "-C", str(paths.root)]
        if tmux.session_exists():
            for name in (DASHBOARD_WINDOW, AGENTS_WINDOW, CONFIG_WINDOW, "events", "admin", "dashboard"):   # incl. older names
                old = tmux.find_window(name)
                if old:
                    tmux.kill_window(old)
            tmux.new_window(DASHBOARD_WINDOW, paths.root, argv, {})
        else:
            tmux.ensure_session(paths.root, DASHBOARD_WINDOW, argv)
        with console.status("Starting supermanager..."):
            _wait(lambda: is_daemon_running(paths.socket), 20, "the daemon did not start; run `supermanager dashboard` to see why")

    for name, command in ((AGENTS_WINDOW, "agents-page"), (CONFIG_WINDOW, "config-page")):
        if tmux.session_exists() and not tmux.find_window(name):
            tmux.new_window(name, paths.root, [*supermanager_argv(), command, "-C", str(paths.root)], {})
    if not tmux.session_exists():
        console.print("[red]A supermanager daemon is running, but its workspace is not on this tmux server[/red] "
                      "(probably an older version). Stop it, then start again:\n"
                      f"  pkill -f 'supermanager dashboard -C {paths.root}'")
        raise typer.Exit(1)
    client = _client(paths)
    if config.manager.autostart:
        with console.status("Starting the manager Claude..."):
            _wait(lambda: (client.call("get_status").get("manager") or {}).get("running"), 30,
                  "the manager did not start; press ctrl+a for the tasks page and read the events")
    st = client.call("get_status")
    console.print(Panel.fit(
        f"[bold]{config.project_name}[/bold] is up.\n\n"
        f"  manager  → chat opens now; also in claude.ai as [cyan]{config.manager_rc_name()}[/cyan]\n"
        f"  agents   → {st['concurrency'] - st['free_slots']}/{st['concurrency']} running\n\n"
        f"  [bold]{KEY}[/bold] cycles manager → tasks → agents → config. Every other key goes to Claude.\n"
        "  On the tasks page: enter opens a session, q leaves everything running, Q stops it all.",
        title="supermanager", border_style="green"))
    if no_attach:
        return
    target = tmux.find_window(DASHBOARD_WINDOW if dashboard or not st.get("manager") else MANAGER_WINDOW)
    if inside_tmux_session(config.tmux_session):
        if target:
            tmux.select_window(target)
        return
    os.execvp("tmux", tmux.attach_argv(target))


def _wait(condition, seconds: float, failure: str) -> None:
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            if condition():
                return
        except (DaemonUnavailable, DaemonError):
            pass
        time.sleep(0.4)
    console.print(f"[red]{failure}[/red]")
    raise typer.Exit(1)


@app.command(hidden=True)
def dashboard(project: Optional[Path] = PROJECT_OPT):
    """Run the daemon + dashboard in this terminal (what `supermanager` starts inside tmux)."""
    paths = _paths(project)
    config = _require_config(paths)
    paths.ensure_layout()
    from .daemon import is_daemon_running
    if is_daemon_running(paths.socket):
        console.print("[yellow]A supermanager daemon is already running for this project.[/yellow]")
        raise typer.Exit(1)
    from .orchestrator import Orchestrator
    from .tui.app import SupermanagerApp
    SupermanagerApp(Orchestrator(paths, config)).run()


@app.command("agents-page", hidden=True)
def agents_page(project: Optional[Path] = PROJECT_OPT):
    """Run the agents page in this terminal (the `agents` window)."""
    paths = _paths(project)
    _require_config(paths)
    from .tui.agents_page import AgentsApp
    AgentsApp(paths).run()


@app.command("config-page", hidden=True)
def config_page(project: Optional[Path] = PROJECT_OPT):
    """Run the config page in this terminal (the `config` window)."""
    paths = _paths(project)
    _require_config(paths)
    from .tui.config_page import ConfigApp
    ConfigApp(paths).run()


def _auto_init(paths: ProjectPaths) -> None:
    """First run in a folder: create the config with defaults, no questions. Everything can be changed later."""
    config = Config(project_name=paths.root.name)   # worktrees on by default
    paths.ensure_layout()
    save_config(paths.config, config)
    console.print(f"[green]New project[/green] [bold]{config.project_name}[/bold] in {paths.root} → created "
                  f"{paths.config.relative_to(paths.root)} (concurrency {config.agents.concurrency}, worktrees on). "
                  "Change with `supermanager config set` or the , key in the dashboard.")
    if not paths.is_git_repo():
        console.print("[yellow]This folder is not a git repository yet.[/yellow] Agents need one for worktrees: "
                      "run `git init` here, or turn them off with `supermanager config set agents.worktrees false`.")


async def _run_headless(orch) -> None:
    from .daemon import Daemon
    daemon = Daemon(orch)
    await daemon.start()
    orch.subscribe(lambda ev: console.print(f"[dim]{time.strftime('%H:%M:%S', time.localtime(ev.ts))}[/dim] "
                                            f"[bold]{ev.kind}[/bold] {ev.message}"))
    orch.reconcile(startup=True)
    orch.ensure_manager()
    console.print(f"supermanager daemon listening on {orch.paths.socket} (Ctrl-C to stop)")
    try:
        while not orch.exit_requested:
            await asyncio.sleep(5)
            await asyncio.to_thread(orch.reconcile)
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        console.print("Stopping agents and manager...")
        await asyncio.to_thread(orch.shutdown, True)
        await daemon.stop()


# --------------------------------------------------------------------------------------- read-only
@app.command()
def status(project: Optional[Path] = PROJECT_OPT):
    """Show manager state, slots and task counts."""
    paths = _paths(project)
    config = _require_config(paths)
    try:
        st = _client(paths).call("get_status")
        live = True
    except DaemonUnavailable:
        state = _load_state(paths)
        counts: dict[str, int] = {}
        for t in state.tasks.values():
            counts[t.status] = counts.get(t.status, 0) + 1
        st = {"project": config.project_name, "concurrency": config.agents.concurrency, "free_slots": "?",
              "worktrees": config.agents.worktrees, "manager": None, "task_counts": counts}
        live = False
    m = st.get("manager")
    mgr = "not started" if not m else ("running" if m["running"] else "stopped") + f" ({m['phase']}, RC {m['rc_name']})"
    console.print(Panel.fit(
        f"project: [bold]{st['project']}[/bold]   daemon: {'[green]running[/green]' if live else '[red]not running[/red]'}\n"
        f"manager: {mgr}\n"
        f"slots: {st['free_slots']} free of {st['concurrency']}   worktrees: {st['worktrees']}\n"
        f"tasks: {json.dumps(st['task_counts'])}", title="supermanager status"))


@app.command()
def tasks(project: Optional[Path] = PROJECT_OPT, status_filter: Optional[str] = typer.Option(None, "--status")):
    """List tasks in backlog order."""
    paths = _paths(project)
    _require_config(paths)
    state = _load_state(paths)
    table = Table(box=box.SIMPLE_HEAD)
    for col in ("ID", "Pri", "Status", "Title", "Agent"):
        table.add_column(col)
    for tid in state.order:
        t = state.tasks[tid]
        if status_filter and t.status != status_filter:
            continue
        agent = f"{t.agent.phase} · {t.agent.branch or 'root'}" if t.agent else ""
        table.add_row(t.id, t.priority, t.status, t.title, agent)
    console.print(table)


@app.command()
def show(task_id: str, project: Optional[Path] = PROJECT_OPT):
    """Show one task in full."""
    paths = _paths(project)
    _require_config(paths)
    state = _load_state(paths)
    t = state.tasks.get(task_id.upper())
    if not t:
        console.print(f"[red]No task {task_id}[/red]")
        raise typer.Exit(1)
    console.print(Panel(_task_markdown(t), title=f"{t.id} · {t.title}"))


def _task_markdown(t) -> str:
    lines = [f"[bold]Status:[/bold] {t.status}   [bold]Priority:[/bold] {t.priority}", "",
             f"[bold]Problem[/bold]\n{t.problem}", "", f"[bold]Expected outcome[/bold]\n{t.expected_outcome}", "",
             "[bold]Acceptance criteria[/bold]"] + [f"  • {c}" for c in t.acceptance_criteria]
    lines += ["", f"[bold]Verification[/bold]\n{t.verification}"]
    if t.context:
        lines += ["", f"[bold]Context[/bold]\n{t.context}"]
    if t.agent:
        lines += ["", f"[bold]Agent[/bold] phase={t.agent.phase} RC={t.agent.rc_name} branch={t.agent.branch or '-'} "
                      f"worktree={t.agent.worktree or '-'}"]
    for s in t.sessions:
        lines += ["", f"[bold]Session[/bold] {s.get('tool', '?')} {s.get('model', '')} {s.get('effort', '')} "
                      f"id={s.get('session_id') or '-'}\n  transcript: {s.get('copy') or s.get('transcript') or '-'}"]
    if t.blocked_reason:
        lines += ["", f"[bold red]Blocked:[/bold red] {t.blocked_reason}"]
    if t.result:
        lines += ["", f"[bold green]Result[/bold green]\n{t.result['summary']}\n\n[bold]Verification notes[/bold]\n"
                      f"{t.result['verification_notes']}"]
    return "\n".join(lines)


@app.command()
def events(project: Optional[Path] = PROJECT_OPT, limit: int = 30):
    """Print recent events. Grep-friendly: one line each, `HH:MM:SS kind task message`."""
    paths = _paths(project)
    _require_config(paths)
    for e in _load_state(paths).events[-limit:]:
        console.print(f"{time.strftime('%H:%M:%S', time.localtime(e.ts))} {e.kind:<12} {e.task_id or '-':<6} {e.message}")


# ------------------------------------------------------------------------------------------ actions
@app.command()
def add(project: Optional[Path] = PROJECT_OPT):
    """Add a task interactively (same quality checks as the manager's tool)."""
    paths = _paths(project)
    _require_config(paths)
    title = typer.prompt("Title")
    problem = typer.prompt("Problem (what is wrong/wanted, where, how it shows)")
    outcome = typer.prompt("Expected outcome")
    console.print("Acceptance criteria, one per line (empty line to finish):")
    criteria = []
    while (line := input("  • ").strip()):
        criteria.append(line)
    verification = typer.prompt("Verification (command or steps)")
    context = typer.prompt("Context (files, links, constraints)", default="")
    priority = typer.prompt("Priority (P0-P3)", default="P2")
    task = _call(paths, "create_task", title=title, problem=problem, expected_outcome=outcome,
                 acceptance_criteria=criteria, verification=verification, context=context, priority=priority)
    console.print(f"[green]Created {task['id']}[/green] {task['title']}")


@app.command()
def spawn(task_id: Optional[str] = typer.Argument(None), project: Optional[Path] = PROJECT_OPT,
          resume: Optional[bool] = typer.Option(None, help="Resume the previous conversation if there is one."),
          tool: Optional[str] = typer.Option(None, help="claude or codex (saved on the task)."),
          model: Optional[str] = typer.Option(None, help="Model for this task's agent (saved on the task)."),
          effort: Optional[str] = typer.Option(None, help="Effort for this task's agent (saved on the task).")):
    """Start an agent for a task (top of backlog if omitted)."""
    paths = _paths(project)
    t = _call(paths, "spawn_agent", task_id=task_id, resume=resume, tool=tool, model=model, effort=effort)
    a = t["agent"]
    console.print(f"[green]Agent started for {t['id']}[/green] ({a['tool']} {a['model']} {a['effort']}".rstrip()
                  + (f", RC: {a['rc_name']}" if a["rc_name"] else "") + ")")


@app.command()
def start(task_id: str, project: Optional[Path] = PROJECT_OPT):
    """Ask the manager to dispatch a task (it spawns the agent; it never works on it itself)."""
    t = _call(_paths(project), "ask_manager_to_start", task_id=task_id)
    console.print(f"Asked the manager to start {t['id']}. Watch the manager chat or `supermanager tasks`.")


@app.command()
def stop(task_id: str, project: Optional[Path] = PROJECT_OPT,
         requeue: bool = typer.Option(False, help="Put the task back in the backlog.")):
    """Stop a running agent."""
    paths = _paths(project)
    t = _call(paths, "stop_agent", task_id=task_id, requeue=requeue)
    console.print(f"Stopped {t['id']}; status is now {t['status']}.")


@app.command()
def attach(target: str = typer.Argument("manager", help="'manager' or a task id like T-003"),
           project: Optional[Path] = PROJECT_OPT):
    """Open the tmux window of the manager or of a task's agent in this terminal."""
    paths = _paths(project)
    config = _require_config(paths)
    state = _load_state(paths)
    from .tmux import Tmux
    tmux = Tmux(config.tmux_session)
    if target.lower() == "manager":
        window = state.manager.tmux_window if state.manager else None
    else:
        t = state.tasks.get(target.upper())
        window = t.agent.tmux_window if t and t.agent else None
    if not window or not tmux.window_exists(window):
        console.print(f"[red]No live session for {target}.[/red]")
        raise typer.Exit(1)
    os.execvp("tmux", tmux.attach_argv(window))


@manager_app.command("start")
def manager_start(project: Optional[Path] = PROJECT_OPT,
                  resume: Optional[bool] = typer.Option(None, help="Resume the previous manager conversation.")):
    """Start the manager Claude session (needs the daemon running)."""
    paths = _paths(project)
    m = _call(paths, "start_manager", resume=resume)
    console.print(f"[green]Manager started[/green] (RC: {m['rc_name']}). Attach with `supermanager attach`.")


@manager_app.command("stop")
def manager_stop(project: Optional[Path] = PROJECT_OPT):
    """Stop the manager Claude session."""
    _call(_paths(project), "stop_manager")
    console.print("Manager stopped.")


@config_app.command("show")
def config_show(project: Optional[Path] = PROJECT_OPT):
    """Print the current config."""
    paths = _paths(project)
    _require_config(paths)
    console.print(paths.config.read_text())


@config_app.command("set")
def config_set(key: str, value: str, project: Optional[Path] = PROJECT_OPT):
    """Change a setting, e.g. `supermanager config set agents.concurrency 5`."""
    paths = _paths(project)
    config = _require_config(paths)
    try:
        _client(paths).call("set_config", key=key, value=value)
    except DaemonUnavailable:
        try:
            set_key(config, key, value)
        except (KeyError, ValueError) as exc:
            console.print(f"[red]{exc}[/red]")
            raise typer.Exit(1)
        save_config(paths.config, config)
    except DaemonError as exc:
        console.print(f"[red]{exc}[/red]")
        raise typer.Exit(1)
    console.print(f"{key} = {value}")


@config_app.command("keys")
def config_keys():
    """List settings that `config set` accepts."""
    for k, kind in sorted(SETTABLE_KEYS.items()):
        console.print(f"{k:<32} {kind.__name__}")


# ---------------------------------------------------------------------------------- internal plumbing
@app.command(hidden=True)
def mcp(role: str = typer.Option(..., help="manager or agent"),
        project: Path = typer.Option(..., help="Project root"),
        task: Optional[str] = typer.Option(None, help="Task id (agents only)"),
        tool: str = typer.Option("claude", help="claude or codex: which tools the agent gets")):
    """MCP stdio bridge loaded by Claude and Codex sessions (internal)."""
    from .mcp_server import run
    run(project, role, task, tool)


@app.command(hidden=True)
def hook(event: str = typer.Argument(...), project: Path = typer.Option(...),
         task: Optional[str] = typer.Option(None)):
    """Claude Code / Codex hook receiver (internal). Reads the hook JSON on stdin and forwards it to the daemon."""
    payload: dict = {}
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
    except (json.JSONDecodeError, OSError):
        pass
    keep = ("session_id", "transcript_path", "hook_event_name", "tool_name", "reason", "notification_type", "message")
    slim = {k: payload.get(k) for k in keep if k in payload}
    try:
        DaemonClient(ProjectPaths(project).socket).call(
            "hook", timeout=3.0, role="agent" if task else "manager", task_id=task, event=event, payload=slim)
    except (DaemonUnavailable, DaemonError):
        pass
    raise typer.Exit(0)


def main() -> None:
    app()


if __name__ == "__main__":
    main()
