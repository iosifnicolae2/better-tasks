"""The tasks page, keyboard driven: the backlog — the project's roadmap. Agents are their own tmux windows and
the notices about them (plan ready, blocked, finished) pop up on the agents page, not here.

It also hosts the daemon socket, so closing it stops the bridge for manager and agents.
"""

from __future__ import annotations

import asyncio
import queue
import signal
import subprocess
import threading

from rich.text import Text
from textual import on, work
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Vertical
from textual.screen import ModalScreen
from textual.widgets import DataTable, Footer, Static

from ..daemon import Daemon
from ..models import FINISHED_STATUSES, PRIORITIES, Event, Task, TaskStatus
from ..orchestrator import Orchestrator, OrchestratorError
from ..tmux import CONFIG_WINDOW, DASHBOARD_WINDOW, KEY, inside_tmux_session
from .shared import FLEX, PageApp, PageTable, SearchBar, TitleScreen, edit_task, wrap

STATUS_STYLE = {
    TaskStatus.BACKLOG: "white", TaskStatus.PLANNING: "yellow", TaskStatus.WORKING: "bright_green",
    TaskStatus.BLOCKED: "bright_red", TaskStatus.DONE: "green", TaskStatus.INTERRUPTED: "magenta",
    TaskStatus.CANCELLED: "dim",
}
STARTABLE = {TaskStatus.BACKLOG, TaskStatus.INTERRUPTED}
# (name, width); the Title column takes whatever is left. Fixed widths keep the rows from shifting when a
# bell or a longer status appears — the Agent column, last in the row, is where those show up.
BASE_COLUMNS = (("ID", 6), ("Pri", 3), ("Status", 11), ("Title", FLEX))
AGENT_COLUMN_SPEC = ("Agent", 36)   # always last; a click on this cell starts / opens the agent
AGENT_WIDTH = 36

HELP = """\
[b]tasks[/b]   enter / click  open the task's agent; without one, edit the task file in your editor
         n  new task (a title, then the file opens in your editor)      i  edit the task file
         s  start an agent on it     p  pause its agent (Esc: it stops and waits for you)     o  open its agent
         h  show / hide the finished tasks (done, cancelled; hidden by default — tasks.hide_done on the config page)
         order: running agents first, then priority, then the backlog order. Click a column title to sort by it instead.
         x  delete the task     d  mark it done (its agent is stopped)     X  stop the agent, task back to backlog
         r  requeue a finished task     D  cancel     c  close a finished session / remove its worktree
         J/K  move it down/up the backlog     +/-  concurrency     m  manager start/stop     t  ask the manager to start it
         ctrl+w  search (type, esc clears)     click a column title to sort     ← →  pages     , config
         q  leave (everything keeps running)     Q or ctrl+c ctrl+c (any page)  quit all: manager, agents, tmux

{KEY} cycles manager → tasks → agents → config. In the bar at the bottom, `agents` lights up while you are in an
agent's window; click a name there to jump to it. Inside a Claude window every other key goes to Claude.
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


# ---------------------------------------------------------------------------------------------- app
class SupermanagerApp(PageApp):
    CSS_PATH = "app.tcss"
    TITLE = "supermanager"
    PAGE = DASHBOARD_WINDOW
    BINDINGS = [
        Binding("n,N", "new_task", "New task"),
        Binding("enter", "open_selected", "Open"),
        Binding("s", "spawn_selected", "Start"),
        Binding("p", "pause_selected", "Pause"),
        Binding("x", "delete_selected", "Delete"),
        Binding("d", "close_selected", "Done"),
        Binding("i", "edit_selected", "Edit file"),
        Binding("h", "toggle_done", "Show done"),
        Binding("question_mark", "help", "Help"),
        Binding("q", "detach", "Leave"),
        Binding("o", "open_agent", "Open agent", show=False),
        Binding("t", "ask_manager", "Ask manager", show=False),
        Binding("X", "stop_selected", "Stop agent", show=False),
        Binding("comma", "settings", "Settings", show=False),
        Binding("Q", "leave", "Quit all", show=False),
        Binding("m", "toggle_manager", "Manager", show=False),
        Binding("r", "requeue_selected", "Requeue", show=False),
        Binding("D", "cancel_selected", "Cancel", show=False),
        Binding("c", "clean_selected", "Clean", show=False),
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
        self.show_done = not orch.config.tasks.hide_done   # h flips it for this session only
        self.sub_title = orch.config.project_name

    @property
    def tmux_session(self) -> str:
        return self.orch.config.tmux_session

    # ----------------------------------------------------------------- layout
    def compose(self) -> ComposeResult:
        yield PageTable(id="tasks-table")   # its action column is set on every render (fields shift it)
        yield SearchBar()
        yield Footer()

    async def on_mount(self) -> None:
        await self.daemon.start()
        self.orch.subscribe(self._events.put)
        self.orch.on_exit_request = self._exit_requested
        self.orch.reconcile(startup=True)
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

    def _exit_requested(self, why: str) -> None:
        """Called by the orchestrator from any thread (hook handler, reconcile worker, or the app thread itself)."""
        if threading.get_ident() == self._thread_id:
            self._quit()
        else:
            self.call_from_thread(self._quit)

    def _boot(self) -> None:
        self.orch.ensure_manager()
        self.call_from_thread(self.refresh_all)

    async def on_unmount(self) -> None:
        await self.daemon.stop()

    # ---------------------------------------------------------------- refresh
    def _drain_events(self) -> None:
        """Redraw when something happened. The notices themselves pop up on the agents page: this page is the
        roadmap, and a task changing status there is not something to interrupt you with."""
        got = False
        while True:
            try:
                self._events.get_nowait()
            except queue.Empty:
                break
            got = True
        if got:
            self.refresh_all()

    @work(thread=True, exclusive=True, group="reconcile")
    def _periodic_reconcile(self) -> None:
        self.orch.reconcile()
        self.call_from_thread(self.refresh_all)

    def refresh_all(self) -> None:
        self.orch.update_bar_counts()
        self._refresh_tasks()

    def rerender(self) -> None:
        self._refresh_tasks()

    def _shown_fields(self) -> list:
        """The project's own task fields that asked for a column (labels and a date, unless config.toml says else)."""
        return [f for f in self.orch.config.task_fields() if f.column]

    def _refresh_tasks(self) -> None:
        table = self.query_one("#tasks-table", DataTable)
        previous = self._selected_task
        fields = self._shown_fields()
        columns = [*BASE_COLUMNS, *[(f.column, f.width) for f in fields], AGENT_COLUMN_SPEC]
        table.action_columns = (len(columns) - 1,)   # the Agent column moves when fields are added
        table.clear(columns=True)
        self.add_columns(table, *columns)
        width = self.flex_width
        tasks = [t for t in self.orch.list_tasks()
                 if self.matches(t.id, t.priority, t.status, t.title, _agent_cell(t),
                                 *(f.show(t.fields.get(f.name)) for f in fields))]
        hidden = 0
        if not self.show_done:
            hidden = sum(1 for t in tasks if t.status in FINISHED_STATUSES)
            tasks = [t for t in tasks if t.status not in FINISHED_STATUSES]
        tasks = self.sorted_rows(tasks, _sort_value(fields)) if self.sort else sorted(tasks, key=_default_order)
        for t in tasks:
            table.add_row(t.id, t.priority, Text(t.status, style=STATUS_STYLE.get(t.status, "white")),
                          wrap(t.title, width),
                          *(wrap(f.show(t.fields.get(f.name)), f.width, "cyan") for f in fields),
                          _agent_cell(t, AGENT_WIDTH), key=t.id, height=None)
        filler = [""] * len(fields)
        if not tasks and not hidden:
            hint = "No task matches the search." if self.query else "No tasks yet: n creates one, or tell the manager what you want."
            table.add_row("", "", "", Text(hint, style="dim"), *filler, "")
        if hidden:
            table.add_row("", "", "", Text(f"{hidden} finished task(s) hidden — h shows them", style="dim"), *filler, "")
        ids = [t.id for t in tasks]
        self._selected_task = previous if previous in ids else (ids[0] if ids else None)
        if self._selected_task:
            table.move_cursor(row=ids.index(self._selected_task))

    @on(DataTable.RowHighlighted, "#tasks-table")
    def _task_row(self, event: DataTable.RowHighlighted) -> None:
        self._selected_task = event.row_key.value if event.row_key else None

    @on(DataTable.RowSelected)
    def _row_enter(self) -> None:
        self.action_open_selected()

    @on(PageTable.CellClicked)
    def _agent_cell_clicked(self, event: PageTable.CellClicked) -> None:
        """A click on the Agent cell: starts an agent on a waiting task, opens the agent of a running one."""
        self._selected_task = event.row_key.value
        task = self._current_task()
        if task and task.status in STARTABLE:
            self._spawn(task.id)
        else:
            self.action_open_agent()

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

    def action_toggle_done(self) -> None:
        """h: show or hide the finished tasks. The starting state comes from tasks.hide_done."""
        self.show_done = not self.show_done
        self._refresh_tasks()
        self.notify("Showing finished tasks." if self.show_done else "Finished tasks hidden.")

    def action_help(self) -> None:
        self.push_screen(HelpScreen())

    def action_refresh(self) -> None:
        self.orch.reconcile()
        self.refresh_all()

    def action_settings(self) -> None:
        """, jumps to the config window (its own page); outside tmux, point at the command line instead."""
        window = self.orch.tmux.find_window(CONFIG_WINDOW)
        if window and inside_tmux_session(self.orch.config.tmux_session):
            self.orch.tmux.select_window(window)
        else:
            self.notify("Settings live on the config page (window `config`) or `supermanager config set key value`.")

    def action_edit_selected(self) -> None:
        task = self._task_for_action()
        if not task:
            self.notify("Select a task first.", severity="warning")
            return
        self._open_in_editor(task.id)

    def _open_in_editor(self, task_id: str) -> None:
        """Open a task's Markdown file in the configured editor (tasks.editor, default idea) or the built-in one."""
        edit_task(self, self.orch.config.tasks.editor, self.orch.task_file(task_id))

    def action_toggle_manager(self) -> None:
        if self.orch.manager_alive():
            self.push_screen(ConfirmScreen("Stop the manager session?"),
                             lambda yes: self._try(self.orch.stop_manager) if yes else None)
        else:
            self._try(self.orch.start_manager, ok="Manager starting.")

    def _selected_window(self) -> str | None:
        task = self._current_task()
        if task and task.agent and task.agent.session_open:
            return task.agent.tmux_window
        return self.orch.state.manager.tmux_window if self.orch.manager_alive() else None

    def action_open_selected(self) -> None:
        """enter / click on a row: the running agent opens; a task without one opens its file in your editor."""
        task = self._current_task()
        if not task:
            return
        if task.agent and task.agent.session_open:
            self.action_open_agent()
        else:
            self._open_in_editor(task.id)

    def action_open_agent(self) -> None:
        """o on a task: open the agent working on it (enter would open the file)."""
        window = self._selected_window()
        if not window:
            self.notify("No session for this task yet.", severity="warning")
            return
        self.orch.acknowledge(self._selected_session())
        self._attach_window(window)

    def _selected_session(self) -> str:
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
        return self._current_task()

    def action_ask_manager(self) -> None:
        task = self._task_for_action()
        if not task:
            self.notify("Select a task first.", severity="warning")
            return
        self._try(self.orch.ask_manager_to_start, task.id, ok=f"Asked the manager to start {task.id}; it will spawn an agent.")

    @work(thread=True, exclusive=True, group="spawn")
    def _spawn(self, task_id: str) -> None:
        """Start an agent on the task and go straight into its window."""
        try:
            task = self.orch.spawn_agent(task_id)
        except OrchestratorError as exc:
            self.call_from_thread(self.notify, str(exc), severity="error", timeout=8)
            self.call_from_thread(self.refresh_all)
            return
        self.call_from_thread(self.refresh_all)
        self.call_from_thread(self._select_task, task.id)
        self.call_from_thread(self._attach_window, task.agent.tmux_window)

    def action_spawn_selected(self) -> None:
        task = self._task_for_action()
        if not task:
            self.notify("Select a task first.", severity="warning")
            return
        self._spawn(task.id)

    def action_pause_selected(self) -> None:
        task = self._task_for_action()
        if not task or not task.agent or not task.agent.session_open:
            self.notify("No running agent selected.", severity="warning")
            return
        self._try(self.orch.pause_session, task.id, ok=f"Paused {task.id}: Esc sent, it waits for your next message.")

    def action_stop_selected(self) -> None:
        task = self._task_for_action()
        if not task or not task.agent or not task.agent.session_open:
            self.notify("No running agent selected.", severity="warning")
            return
        self.push_screen(ConfirmScreen(f"Stop the agent for {task.id} and put the task back in the backlog?"),
                         lambda yes: self._try(self.orch.stop_agent, task.id, requeue=True) if yes else None)

    def action_close_selected(self) -> None:
        """d: mark the task done; a running agent is stopped first."""
        task = self._task_for_action()
        if not task:
            return
        if task.status == TaskStatus.DONE:
            self.notify(f"{task.id} is already closed.")
            return
        running = " Its agent is stopped." if task.agent and task.agent.session_open else ""
        self.push_screen(ConfirmScreen(f"Close {task.id} '{task.title}' (mark it done)?{running}"),
                         lambda yes: self._try(self.orch.close_task, task.id) if yes else None)

    def action_delete_selected(self) -> None:
        """x: remove the task and its file."""
        task = self._task_for_action()
        if not task:
            return
        running = " Its agent is stopped first." if task.agent and task.agent.session_open else ""
        def go(yes: bool) -> None:
            if not yes:
                return
            if task.agent and task.agent.session_open:
                self._try(self.orch.stop_agent, task.id)
            self._try(self.orch.delete_task, task.id, ok=f"Deleted {task.id}.")
        self.push_screen(ConfirmScreen(f"Delete {task.id} '{task.title}'? The task file is removed too.{running}"), go)

    def action_clean_selected(self) -> None:
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
        def created(title: str | None) -> None:
            if not title:
                return
            try:
                task = self.orch.create_task_from_template(title)
            except OrchestratorError as exc:
                self.notify(str(exc), severity="error", timeout=8)
                return
            self.refresh_all()
            self._select_task(task.id)
            self._open_in_editor(task.id)
        self.push_screen(TitleScreen("New task", "The task file is created from the template and opened in your editor."),
                         created)

    def _select_task(self, task_id: str) -> None:
        table = self.query_one("#tasks-table", DataTable)
        ids = [t.id for t in self.orch.list_tasks()]
        if task_id in ids:
            self._selected_task = task_id
            table.move_cursor(row=ids.index(task_id))

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

    def quit_all(self) -> None:
        """ctrl+c ctrl+c: no confirm dialog, the second press is the confirmation."""
        self._quit()

    def _quit(self) -> None:
        """Stop everything, then leave. Called by Q, ctrl+c ctrl+c (any page) and by SIGTERM/SIGHUP."""
        try:
            self.orch.shutdown(stop_agents=True)
        except Exception:
            pass
        self.exit()
        if inside_tmux_session(self.orch.config.tmux_session):
            self.orch.tmux._run("kill-session", "-t", self.orch.config.tmux_session, check=False)


# ------------------------------------------------------------------------------------------ helpers
def _agent_cell(t: Task, width: int = 200) -> Text:
    """The Agent column: what to do (start), or who works on it and how it is doing."""
    a = t.agent
    if t.status in STARTABLE:
        return Text("▶ start (s)", style="cyan")
    if a and a.session_open:
        name = a.rc_name or f"{a.tool} {t.id}"
        if a.attention:
            return wrap(f"🔔 {name} · {a.attention}", width, "bold yellow")
        return wrap(f"{name} · {a.phase}", width, "yellow")
    if t.status == TaskStatus.DONE:
        return Text(f"done · {a.branch}" if a and a.branch else "done", style="green")
    return Text(str(t.status), style="dim")


def _default_order(t: Task) -> tuple:
    """Tasks with a live agent first, then by priority. Same priority keeps the backlog order (stable sort)."""
    running = 0 if t.agent and t.agent.session_open else 1
    return (running, PRIORITIES.index(t.priority) if t.priority in PRIORITIES else len(PRIORITIES))


def _sort_value(fields: list):
    """How each column sorts, the project's own fields included."""
    def value(t: Task, column: str) -> object:
        for f in fields:
            if f.column == column:
                return f.show(t.fields.get(f.name))
        return {"ID": t.id, "Pri": t.priority, "Status": str(t.status), "Title": t.title,
                "Agent": _agent_cell(t).plain}.get(column)
    return value
