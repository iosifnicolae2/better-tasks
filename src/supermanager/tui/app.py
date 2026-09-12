"""The dashboard: two tabs (Agents, Tasks), keyboard driven, plus a short event log.

It also hosts the daemon socket, so closing it stops the bridge for manager and agents (their tmux sessions stay).
"""

from __future__ import annotations

import asyncio
import os
import queue
import shutil
import signal
import subprocess
import sys
import time

from rich.text import Text
from textual import on, work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.screen import ModalScreen
from textual.widgets import (Button, DataTable, Header, Input, Label, Markdown, RichLog, Select, Static,
                             Switch, TabbedContent, TabPane, TextArea)

from ..config import SETTABLE_KEYS, SETTING_HELP, get_key
from ..daemon import Daemon
from ..models import PRIORITIES, Event, Task, TaskStatus
from ..orchestrator import Orchestrator, OrchestratorError
from ..tmux import KEY, inside_tmux_session

STATUS_STYLE = {
    TaskStatus.BACKLOG: "white", TaskStatus.PLANNING: "yellow", TaskStatus.WORKING: "bright_green",
    TaskStatus.BLOCKED: "bright_red", TaskStatus.DONE: "green", TaskStatus.INTERRUPTED: "magenta",
    TaskStatus.CANCELLED: "dim",
}
EVENT_STYLE = {"done": "green", "blocked": "red", "interrupted": "magenta", "error": "red",
               "manager": "cyan", "agent": "yellow", "task": "white", "progress": "bright_blue", "config": "dim",
               "attention": "bold yellow"}
CHOICES: dict[str, list[str]] = {}
STARTABLE = {TaskStatus.BACKLOG, TaskStatus.INTERRUPTED}

HELP = """\
[b]Agents[/b]   enter open   p pause (sends Esc: Claude stops and waits for you)   x kill   m manager start/stop
[b]Tasks[/b]    t  ask the manager to start it (it spawns an agent, never works on it itself)
          s  spawn an agent directly      enter open its agent      i edit the task file in your editor
          N new   x stop agent   r requeue   d cancel   J/K move down/up   +/- concurrency
[b]General[/b]  ←/→ or 1/2 switch tab   , settings   ? help
          q leave: everything keeps running, `supermanager` brings you back
          Q quit: stops the manager and all agents (tasks go back to the backlog and resume later)

{KEY} from any session brings you here; {KEY} from here goes to the manager. All other keys go to Claude.
"""

EMPTY_TASKS = """\
No tasks yet.

- Open the manager ({KEY}) and tell it what you want; it turns it into checkable tasks and starts agents.
- Or press N to write a task here, then t to ask the manager to start it.
"""


# ------------------------------------------------------------------------------------------- modals
class ConfirmScreen(ModalScreen[bool]):
    BINDINGS = [Binding("escape,n", "dismiss(False)", "No"), Binding("y", "dismiss(True)", "Yes")]

    def __init__(self, question: str):
        super().__init__()
        self.question = question

    def compose(self) -> ComposeResult:
        with Vertical(id="confirm"):
            yield Static(self.question)
            yield Static("[dim]y yes · n / esc no[/dim]")


class HelpScreen(ModalScreen[None]):
    BINDINGS = [Binding("escape,q,question_mark", "dismiss", "Close")]

    def compose(self) -> ComposeResult:
        with Vertical(id="help"):
            yield Static(HELP.replace("{KEY}", KEY))
            yield Static("[dim]esc to close[/dim]")


class NewTaskScreen(ModalScreen[dict | None]):
    BINDINGS = [Binding("escape", "dismiss", "Cancel"), Binding("ctrl+s", "submit", "Create")]

    def compose(self) -> ComposeResult:
        with VerticalScroll(id="dialog"):
            yield Static("[b]New task[/b]   [dim]ctrl+s create · esc cancel[/dim]")
            yield Label("Title")
            yield Input(placeholder="Short, specific title", id="title")
            yield Label("Priority")
            yield Select([(p, p) for p in PRIORITIES], value="P2", id="priority", allow_blank=False)
            yield Label("Problem: what is wrong or wanted, where, how it shows today")
            yield TextArea(id="problem")
            yield Label("Expected outcome: what 'done' looks like")
            yield TextArea(id="outcome")
            yield Label("Acceptance criteria: one per line, each checkable")
            yield TextArea(id="criteria")
            yield Label("Verification: command or precise manual steps")
            yield TextArea(id="verification")
            yield Label("Context: files, links, constraints (optional)")
            yield TextArea(id="context")

    def action_submit(self) -> None:
        self.dismiss({
            "title": self.query_one("#title", Input).value,
            "priority": str(self.query_one("#priority", Select).value),
            "problem": self.query_one("#problem", TextArea).text,
            "expected_outcome": self.query_one("#outcome", TextArea).text,
            "acceptance_criteria": [l for l in self.query_one("#criteria", TextArea).text.splitlines() if l.strip()],
            "verification": self.query_one("#verification", TextArea).text,
            "context": self.query_one("#context", TextArea).text,
        })


class SettingsScreen(ModalScreen[dict | None]):
    BINDINGS = [Binding("escape", "dismiss", "Cancel"), Binding("ctrl+s", "submit", "Save")]

    def __init__(self, orch: Orchestrator):
        super().__init__()
        self.orch = orch

    def compose(self) -> ComposeResult:
        with VerticalScroll(id="dialog"):
            yield Static("[b]Settings[/b]   [dim]ctrl+s save · esc cancel · the manager can change these too[/dim]")
            for key, kind in SETTABLE_KEYS.items():
                value = get_key(self.orch.config, key)
                with Horizontal(classes="setting"):
                    yield Static(f"[b]{key}[/b]\n[dim]{SETTING_HELP.get(key, '')}[/dim]", classes="setting-label")
                    if kind is bool:
                        yield Switch(value=bool(value), id=_wid(key))
                    elif key in CHOICES:
                        yield Select([(c, c) for c in CHOICES[key]], value=value, id=_wid(key), allow_blank=False)
                    else:
                        yield Input(value=str(value), id=_wid(key), type="integer" if kind is int else "text",
                                    classes="setting-input")

    def action_submit(self) -> None:
        values = {}
        for key in SETTABLE_KEYS:
            raw = self.query_one(f"#{_wid(key)}").value
            values[key] = raw if isinstance(raw, bool) else str(raw).strip()
        self.dismiss(values)


# ---------------------------------------------------------------------------------------------- app
class SupermanagerApp(App):
    CSS_PATH = "app.tcss"
    TITLE = "supermanager"
    ENABLE_COMMAND_PALETTE = False
    BINDINGS = [
        Binding("1", "tab('agents')", "Agents"),
        Binding("2", "tab('tasks')", "Tasks"),
        Binding("enter,o", "open_selected", "Open"),
        Binding("t", "ask_manager", "Ask manager"),
        Binding("s", "spawn_selected", "Spawn"),
        Binding("N", "new_task", "New task"),
        Binding("x", "stop_selected", "Kill"),
        Binding("p", "pause_selected", "Pause", show=False),
        Binding("comma", "settings", "Settings"),
        Binding("question_mark", "help", "Help"),
        Binding("q", "detach", "Leave"),
        Binding("Q", "leave", "Quit all"),
        Binding("left,bracketleft", "tab_step(-1)", "Prev tab", show=False, priority=True),
        Binding("right,bracketright", "tab_step(1)", "Next tab", show=False, priority=True),
        Binding("i", "edit_selected", "Edit", show=False),
        Binding("m", "toggle_manager", "Manager", show=False),
        Binding("r", "requeue_selected", "Requeue", show=False),
        Binding("d", "cancel_selected", "Cancel", show=False),
        Binding("c", "close_selected", "Close/clean", show=False),
        Binding("J", "move_down", "Down", show=False),
        Binding("K", "move_up", "Up", show=False),
        Binding("plus,equals_sign", "more", "+conc", show=False),
        Binding("minus", "less", "-conc", show=False),
        Binding("e", "refresh", "Refresh", show=False),
    ]

    def __init__(self, orch: Orchestrator):
        super().__init__()
        self.orch = orch
        self.daemon = Daemon(orch)
        self._events: queue.Queue[Event] = queue.Queue()
        self._selected_task: str | None = None
        self._selected_agent: str | None = None
        self.sub_title = orch.config.project_name

    # ----------------------------------------------------------------- layout
    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        yield Static(id="topbar")
        with TabbedContent(initial="agents", id="tabs"):
            with TabPane("Agents", id="agents"):
                yield DataTable(id="agents-table", cursor_type="row", zebra_stripes=True)
            with TabPane("Tasks", id="tasks"):
                with Vertical():
                    yield DataTable(id="tasks-table", cursor_type="row", zebra_stripes=True)
                    yield VerticalScroll(Markdown(id="detail"), id="detail-box")
        log = RichLog(id="events", markup=True, wrap=True, max_lines=300)
        log.border_title = "Events"
        yield log

    async def on_mount(self) -> None:
        self.query_one("#agents-table", DataTable).add_columns("Session", "Status", "Working on", "Branch", "In claude.ai", "Since")
        self.query_one("#tasks-table", DataTable).add_columns("ID", "Pri", "Status", "Title", "Start / agent")
        await self.daemon.start()
        self.orch.subscribe(self._events.put)
        for ev in self.orch.state.events[-20:]:
            self._log_event(ev)
        self.orch.reconcile()
        self.run_worker(self._boot, thread=True)
        self.refresh_all()
        self.set_interval(0.5, self._drain_events)
        self.set_interval(5.0, self._periodic_reconcile)
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGHUP):
            try:
                loop.add_signal_handler(sig, self._quit)
            except (NotImplementedError, RuntimeError):
                pass

    def _boot(self) -> None:
        self.orch.ensure_manager()
        self.call_from_thread(self.refresh_all)

    async def on_unmount(self) -> None:
        await self.daemon.stop()

    # ---------------------------------------------------------------- refresh
    def _drain_events(self) -> None:
        got = False
        while True:
            try:
                ev = self._events.get_nowait()
            except queue.Empty:
                break
            got = True
            self._log_event(ev)
            if ev.kind in ("done", "blocked", "interrupted", "error"):
                self.notify(ev.message[:160], severity="warning" if ev.kind != "done" else "information", timeout=8)
            elif ev.kind == "attention":
                self.notify(f"🔔 {ev.message[:150]} — open it with enter", severity="warning", timeout=10)
        if got:
            self.refresh_all()

    def _log_event(self, ev: Event) -> None:
        style = EVENT_STYLE.get(ev.kind, "white")
        stamp = time.strftime("%H:%M:%S", time.localtime(ev.ts))
        self.query_one("#events", RichLog).write(f"[dim]{stamp}[/dim] [{style}]{ev.kind:<11}[/{style}] {ev.message}")

    @work(thread=True, exclusive=True, group="reconcile")
    def _periodic_reconcile(self) -> None:
        self.orch.reconcile()
        self.call_from_thread(self.refresh_all)

    def refresh_all(self) -> None:
        self._refresh_topbar()
        self._refresh_agents()
        self._refresh_tasks()
        self._refresh_detail()

    def _refresh_topbar(self) -> None:
        st = self.orch.status()
        m = st["manager"]
        if m and m["running"]:
            mgr = f"[green]●[/green] manager [dim]{m['rc_name']}[/dim]"
        elif m or self.orch.config.manager.autostart:
            mgr = "[yellow]○[/yellow] manager starting…" if not m else "[red]○[/red] manager stopped [dim](m)[/dim]"
        else:
            mgr = "[dim]○ manager off (m)[/dim]"
        used = st["concurrency"] - st["free_slots"]
        self.query_one("#topbar", Static).update(
            f" [b]{st['project']}[/b]   {mgr}   agents [b]{used}/{st['concurrency']}[/b]"
            f"   [dim]{KEY} manager · ? help[/dim]")

    def _agent_rows(self) -> list[tuple[str, list]]:
        rows: list[tuple[str, list]] = []
        m = self.orch.state.manager
        if m:
            rows.append(("manager", ["manager", _status(self.orch.manager_alive(), m.phase, m.attention), "the backlog", "",
                                     m.rc_name, _since(m.started_at)]))
        for t in self.orch.list_tasks():
            if t.agent and t.agent.session_open:
                rows.append((t.id, [t.id, _status(True, f"{t.status} · {t.agent.phase}", t.agent.attention), t.title,
                                    t.agent.branch or "root", t.agent.rc_name, _since(t.agent.started_at)]))
        return rows

    def _refresh_agents(self) -> None:
        table = self.query_one("#agents-table", DataTable)
        previous = self._selected_agent
        table.clear()
        rows = self._agent_rows()
        for key, cells in rows:
            table.add_row(*cells, key=key)
        keys = [k for k, _ in rows]
        self._selected_agent = previous if previous in keys else (keys[0] if keys else None)
        if self._selected_agent:
            table.move_cursor(row=keys.index(self._selected_agent))

    def _refresh_tasks(self) -> None:
        table = self.query_one("#tasks-table", DataTable)
        previous = self._selected_task
        table.clear()
        tasks = self.orch.list_tasks()
        for t in tasks:
            if t.status in STARTABLE:
                start = Text("t ask manager · s spawn", style="cyan")
            elif t.agent and t.agent.session_open and t.agent.attention:
                start = Text(f"🔔 {t.agent.attention} · enter to open", style="bold yellow")
            elif t.agent and t.agent.session_open:
                start = Text(f"{t.agent.phase} · enter to open", style="yellow")
            elif t.status == TaskStatus.DONE:
                start = Text(f"done · {t.agent.branch}" if t.agent and t.agent.branch else "done", style="green")
            else:
                start = Text(str(t.status), style="dim")
            table.add_row(t.id, t.priority, Text(t.status, style=STATUS_STYLE.get(t.status, "white")), t.title, start, key=t.id)
        ids = [t.id for t in tasks]
        self._selected_task = previous if previous in ids else (ids[0] if ids else None)
        if self._selected_task:
            table.move_cursor(row=ids.index(self._selected_task))

    @on(DataTable.RowHighlighted, "#tasks-table")
    def _task_row(self, event: DataTable.RowHighlighted) -> None:
        self._selected_task = event.row_key.value if event.row_key else None
        self._refresh_detail()

    @on(DataTable.RowHighlighted, "#agents-table")
    def _agent_row(self, event: DataTable.RowHighlighted) -> None:
        self._selected_agent = event.row_key.value if event.row_key else None

    @on(DataTable.RowSelected)
    def _row_enter(self) -> None:
        self.action_open_selected()

    def _refresh_detail(self) -> None:
        task = self._current_task()
        md = self.query_one("#detail", Markdown)
        if not task:
            md.update(EMPTY_TASKS.replace("{KEY}", KEY) if not self.orch.state.tasks else "")
            return
        md.update(_task_markdown(task))

    def _current_task(self) -> Task | None:
        return self.orch.state.tasks.get(self._selected_task) if self._selected_task else None

    # ---------------------------------------------------------------- actions
    def _try(self, fn, *args, ok: str | None = None, **kwargs) -> None:
        try:
            fn(*args, **kwargs)
            if ok:
                self.notify(ok)
        except OrchestratorError as exc:
            self.notify(str(exc), severity="error", timeout=8)
        self.refresh_all()

    def _active_tab(self) -> str:
        return self.query_one("#tabs", TabbedContent).active

    def action_tab(self, name: str) -> None:
        self.query_one("#tabs", TabbedContent).active = name

    def action_tab_step(self, delta: int) -> None:
        names = ["agents", "tasks"]
        self.action_tab(names[(names.index(self._active_tab()) + delta) % len(names)])

    def action_help(self) -> None:
        self.push_screen(HelpScreen())

    def action_refresh(self) -> None:
        self.orch.reconcile()
        self.refresh_all()

    def action_settings(self) -> None:
        def saved(values: dict | None) -> None:
            if not values:
                return
            changed, errors = [], []
            for key, new in values.items():
                if str(new) == str(get_key(self.orch.config, key)):
                    continue
                try:
                    self.orch.set_config(key, str(new))
                    changed.append(key)
                except OrchestratorError as exc:
                    errors.append(str(exc))
            if changed:
                self.notify("Saved: " + ", ".join(changed))
            if errors:
                self.notify(" ".join(errors), severity="error", timeout=8)
            self.refresh_all()
        self.push_screen(SettingsScreen(self.orch), saved)

    def action_edit_selected(self) -> None:
        """Open the selected task's Markdown file in the configured editor (tasks.editor, default idea)."""
        task = self._task_for_action()
        if not task:
            self.notify("Select a task first (tab 2).", severity="warning")
            return
        path = self.orch.store.tasks.path / f"{task.id}.md"
        editor = self.orch.config.tasks.editor or "idea"
        try:
            subprocess.Popen(_editor_argv(editor, path), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except OSError as exc:
            self.notify(f"Could not run '{editor}': {exc}. Change it with , (tasks.editor).", severity="error", timeout=8)
            return
        self.notify(f"Opened {path.name} in {editor}. Edits are picked up when the file is saved.")

    def action_toggle_manager(self) -> None:
        if self.orch.manager_alive():
            self.push_screen(ConfirmScreen("Stop the manager session?"),
                             lambda yes: self._try(self.orch.stop_manager) if yes else None)
        else:
            self._try(self.orch.start_manager, ok="Manager starting.")

    def _selected_window(self) -> str | None:
        if self._active_tab() == "agents":
            key = self._selected_agent
            if key == "manager" and self.orch.manager_alive():
                return self.orch.state.manager.tmux_window
            task = self.orch.state.tasks.get(key or "")
        else:
            task = self._current_task()
        if task and task.agent and task.agent.session_open:
            return task.agent.tmux_window
        return self.orch.state.manager.tmux_window if self.orch.manager_alive() else None

    def action_open_selected(self) -> None:
        window = self._selected_window()
        if not window:
            self.notify("Nothing to open yet. Start the manager first (m).", severity="warning")
            return
        self.orch.acknowledge(self._selected_session())
        self._attach_window(window)

    def _selected_session(self) -> str:
        if self._active_tab() == "agents":
            return self._selected_agent or "manager"
        task = self._current_task()
        return task.id if task and task.agent and task.agent.session_open else "manager"

    def _attach_window(self, window: str) -> None:
        if inside_tmux_session(self.orch.config.tmux_session):
            self.orch.tmux.select_window(window)
            return
        try:
            with self.suspend():
                subprocess.run(self.orch.tmux.attach_argv(window))
        except Exception as exc:  # e.g. SuspendNotSupported when not in a real terminal
            self.notify(f"Cannot attach from here ({exc}). Use `supermanager attach` in a terminal.", severity="error")
            return
        self.refresh_all()

    def _task_for_action(self) -> Task | None:
        if self._active_tab() == "agents":
            return self.orch.state.tasks.get(self._selected_agent or "")
        return self._current_task()

    def action_ask_manager(self) -> None:
        task = self._task_for_action()
        if not task:
            self.notify("Select a task first (tab 2).", severity="warning")
            return
        self._try(self.orch.ask_manager_to_start, task.id, ok=f"Asked the manager to start {task.id}; it will spawn an agent.")

    @work(thread=True, exclusive=True, group="spawn")
    def _spawn(self, task_id: str) -> None:
        try:
            task = self.orch.spawn_agent(task_id)
            self.call_from_thread(self.notify, f"Agent for {task.id} started. Approve its plan in claude.ai ({task.agent.rc_name}) or open it here.")
        except OrchestratorError as exc:
            self.call_from_thread(self.notify, str(exc), severity="error", timeout=8)
        self.call_from_thread(self.refresh_all)

    def action_spawn_selected(self) -> None:
        task = self._task_for_action()
        if not task:
            self.notify("Select a task first (tab 2).", severity="warning")
            return
        self._spawn(task.id)

    def action_pause_selected(self) -> None:
        target = self._selected_session()
        self._try(self.orch.pause_session, target, ok=f"Paused {target}: Esc sent, it waits for your next message.")

    def action_stop_selected(self) -> None:
        if self._active_tab() == "agents":
            if self._selected_agent == "manager":
                return self.action_toggle_manager()
        task = self._task_for_action()
        if not task or not task.agent or not task.agent.session_open:
            self.notify("No running agent selected.", severity="warning")
            return
        self.push_screen(ConfirmScreen(f"Stop the agent for {task.id} and put the task back in the backlog?"),
                         lambda yes: self._try(self.orch.stop_agent, task.id, requeue=True) if yes else None)

    def action_close_selected(self) -> None:
        task = self._task_for_action()
        if not task or not task.agent:
            return
        if task.agent.session_open:
            self._try(self.orch.close_agent_session, task.id, ok=f"Closed session of {task.id}.")
        elif task.agent.worktree:
            self.push_screen(ConfirmScreen(f"Remove the worktree of {task.id}? Branch {task.agent.branch} is kept; "
                                           "uncommitted changes there are lost."),
                             lambda yes: self._try(self.orch.remove_worktree, task.id, force=True) if yes else None)

    def action_requeue_selected(self) -> None:
        task = self._task_for_action()
        if task:
            self._try(self.orch.requeue_task, task.id)

    def action_cancel_selected(self) -> None:
        task = self._task_for_action()
        if task:
            self.push_screen(ConfirmScreen(f"Cancel {task.id} '{task.title}'?"),
                             lambda yes: self._try(self.orch.cancel_task, task.id) if yes else None)

    def action_new_task(self) -> None:
        def created(data: dict | None) -> None:
            if data:
                self._try(self.orch.create_task, **data, ok="Task created. Press t to ask the manager to start it.")
                self.action_tab("tasks")
        self.push_screen(NewTaskScreen(), created)

    def action_move_down(self) -> None:
        if self._current_task():
            self._try(self.orch.move_task, self._current_task().id, 1)

    def action_move_up(self) -> None:
        if self._current_task():
            self._try(self.orch.move_task, self._current_task().id, -1)

    def action_more(self) -> None:
        self._try(self.orch.set_config, "agents.concurrency", str(self.orch.config.agents.concurrency + 1))

    def action_less(self) -> None:
        self._try(self.orch.set_config, "agents.concurrency", str(max(1, self.orch.config.agents.concurrency - 1)))

    def _running_agents(self) -> int:
        return sum(1 for t in self.orch.state.tasks.values() if t.agent and t.agent.session_open and t.is_active)

    def action_leave(self) -> None:
        n = self._running_agents()
        note = f" {n} running agent(s) are stopped too; their tasks go back to the backlog and resume where they left off." if n else ""
        self.push_screen(ConfirmScreen(f"Quit? This stops the manager and all agents.{note}\n"
                                       "(To leave everything running instead, press q.)"),
                         lambda yes: self._quit() if yes else None)

    def action_detach(self) -> None:
        """Leave the workspace with everything running; `supermanager` brings you back."""
        if inside_tmux_session(self.orch.config.tmux_session):
            self.orch.tmux.detach()
        else:
            self.notify("Not inside the tmux workspace: close this terminal, the daemon keeps running.", severity="warning")

    def _quit(self) -> None:
        """Stop everything, then leave. Called by q and by SIGTERM/SIGHUP."""
        try:
            self.orch.shutdown(stop_agents=True)
        except Exception:
            pass
        self.exit()
        if inside_tmux_session(self.orch.config.tmux_session):
            self.orch.tmux._run("kill-session", "-t", self.orch.config.tmux_session, check=False)


# ------------------------------------------------------------------------------------------ helpers
def _editor_argv(editor: str, path: Path) -> list[str]:
    """`idea file` needs the IDE's command-line launcher; without it fall back to macOS `open -a`."""
    if shutil.which(editor):
        return [editor, str(path)]
    apps = {"idea": "IntelliJ IDEA", "code": "Visual Studio Code", "pycharm": "PyCharm", "webstorm": "WebStorm"}
    if sys.platform == "darwin" and editor in apps:
        return ["open", "-a", apps[editor], str(path)]
    return [editor, str(path)]


def _wid(key: str) -> str:
    return "set-" + key.replace(".", "-")


def _dot(alive: bool, detail: str) -> Text:
    return Text(f"● {detail}", style="green") if alive else Text("○ stopped", style="red")


def _status(alive: bool, detail: str, attention: str) -> Text:
    if alive and attention:
        return Text(f"🔔 {attention}", style="bold yellow")
    return _dot(alive, detail)


def _since(ts: float) -> str:
    mins = int((time.time() - ts) // 60)
    return f"{mins // 60}h {mins % 60}m" if mins >= 60 else f"{mins}m"


def _task_markdown(t: Task) -> str:
    parts = [f"**{t.id} · {t.title}**  ·  {t.status} · {t.priority}", "", f"**Problem** {t.problem}", "",
             f"**Expected** {t.expected_outcome}", "", "**Acceptance criteria**"]
    parts += [f"- {c}" for c in t.acceptance_criteria]
    parts += ["", f"**Verify** {t.verification}"]
    if t.context:
        parts += ["", f"**Context** {t.context}"]
    if t.agent:
        a = t.agent
        parts += ["", f"**Agent** {a.rc_name} · {a.phase}{'' if a.session_open else ' (closed)'} · branch `{a.branch or '-'}`"]
        if a.attention and a.session_open:
            parts += [f"🔔 **{a.attention}** — press enter to open it"]
    if t.blocked_reason:
        parts += ["", f"**Blocked:** {t.blocked_reason}"]
    if t.progress:
        parts += ["", "**Progress**"] + [f"- {p['note']}" for p in t.progress[-4:]]
    if t.result:
        parts += ["", f"**Result** {t.result['summary']}", "", f"**Verification notes** {t.result['verification_notes']}"]
    return "\n".join(parts)
