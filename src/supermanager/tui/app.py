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
from .board import CARD_WIDTH, NO_VALUE, Board, Card, field_grouping, label_chips, status_grouping
from .shared import FLEX, GROUP_PREFIX, PageApp, PageTable, SearchBar, TitleScreen, edit_task, local_time, wrap

STATUS_STYLE = {
    TaskStatus.BACKLOG: "white", TaskStatus.PLANNING: "yellow", TaskStatus.WORKING: "bright_green",
    TaskStatus.BLOCKED: "bright_red", TaskStatus.DONE: "green", TaskStatus.INTERRUPTED: "magenta",
    TaskStatus.CANCELLED: "dim",
}
STARTABLE = {TaskStatus.BACKLOG, TaskStatus.INTERRUPTED}
# (name, width); the Title column takes whatever is left. Fixed widths keep the rows from shifting when a
# bell or a longer status appears — the Agent column, last in the row, is where those show up.
BASE_COLUMNS = (("ID", 6), ("Pri", 3), ("Status", 11), ("Title", FLEX))
AGENT_COLUMN_SPEC = ("Agent", 36)   # a click on this cell starts / opens the agent
TIME_COLUMNS = (("Created", 16), ("Updated", 16))   # last, in this machine's own date format
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
         v  table ⇄ board      g  what it groups by (status, labels, your own fields)      G  headings on/off
         on the board: arrows move the selection, shift+←/→ move the task to another column (status, or the
         field the board groups by), shift+↑/↓ move it up and down the backlog
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
        Binding("v", "toggle_view", "Board/table"),
        Binding("g", "cycle_group", "Group by", show=False),
        Binding("G", "toggle_groups", "Headings", show=False),
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
        self.board_view = orch.config.tasks.view == "board"
        self.group_by = orch.config.tasks.group_by     # "status", or one of the project's own fields
        self.group_rows = orch.config.tasks.group_rows  # headings in the table, on by default
        self.sub_title = orch.config.project_name

    @property
    def tmux_session(self) -> str:
        return self.orch.config.tmux_session

    # ----------------------------------------------------------------- layout
    def compose(self) -> ComposeResult:
        yield PageTable(id="tasks-table")   # its action column is set on every render (fields shift it)
        yield Board(id="tasks-board")
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

    def _visible_tasks(self, fields: list) -> tuple[list[Task], int]:
        """What the search and the finished-task filter leave, in the order the page shows them."""
        tasks = [t for t in self.orch.list_tasks()
                 if self.matches(t.id, t.priority, t.status, t.title, _agent_cell(t),
                                 *(f.show(t.fields.get(f.name)) for f in fields))]
        hidden = 0
        if not self.show_done:
            hidden = sum(1 for t in tasks if t.status in FINISHED_STATUSES)
            tasks = [t for t in tasks if t.status not in FINISHED_STATUSES]
        tasks = self.sorted_rows(tasks, _sort_value(fields)) if self.sort else sorted(tasks, key=_default_order)
        return tasks, hidden

    def _refresh_tasks(self) -> None:
        table = self.query_one("#tasks-table", DataTable)
        board = self.query_one(Board)
        table.display = not self.board_view
        board.display = self.board_view
        if self.board_view:
            self._refresh_board(board)
            return
        previous = self._selected_task
        fields = self._shown_fields()
        columns = [*BASE_COLUMNS, *[(f.column, f.width) for f in fields], AGENT_COLUMN_SPEC, *TIME_COLUMNS]
        table.action_columns = (len(columns) - 1 - len(TIME_COLUMNS),)   # the Agent column: fields shift it
        table.clear(columns=True)
        self.add_columns(table, *columns)
        width = self.flex_width
        tasks, hidden = self._visible_tasks(fields)
        filler = [""] * (len(fields) + len(TIME_COLUMNS))

        def row(t: Task) -> None:
            table.add_row(t.id, t.priority, Text(t.status, style=STATUS_STYLE.get(t.status, "white")),
                          wrap(t.title, width),
                          *(_field_cell(f, t.fields.get(f.name)) for f in fields),
                          _agent_cell(t, AGENT_WIDTH),
                          Text(local_time(t.created_at), style="dim"), Text(local_time(t.updated_at), style="dim"),
                          key=t.id, height=None)

        if self.group_rows and tasks:
            grouping = self._grouping(tasks)
            # A task can carry several labels; in a list it belongs under one heading, the first of them.
            for value in grouping.values:
                in_group = [t for t in tasks if grouping.of(t)[0] == value]
                if not in_group:
                    continue
                table.add_row("", "", "", Text(f"{value}  ({len(in_group)})", style="bold reverse"), *filler, "",
                              key=GROUP_PREFIX + value)
                for t in in_group:
                    row(t)
        else:
            for t in tasks:
                row(t)
        if not tasks and not hidden:
            hint = "No task matches the search." if self.query else "No tasks yet: n creates one, or tell the manager what you want."
            table.add_row("", "", "", Text(hint, style="dim"), *filler, "")
        if hidden:
            table.add_row("", "", "", Text(f"{hidden} finished task(s) hidden — h shows them", style="dim"), *filler, "")
        ids = [str(r.key.value) for r in table.ordered_rows]
        if previous not in ids:
            previous = next((i for i in ids if not i.startswith(GROUP_PREFIX)), None)
        self._selected_task = previous if previous and not previous.startswith(GROUP_PREFIX) else None
        if self._selected_task:
            table.move_to_task(ids.index(self._selected_task))

    # ------------------------------------------------------------------ board
    def _grouping(self, tasks: list[Task]):
        """What the board's columns are: the statuses, or the values of one of the project's fields."""
        field = next((f for f in self.orch.config.task_fields() if f.name == self.group_by), None)
        return field_grouping(field, tasks) if field else status_grouping(tasks)

    def _refresh_board(self, board: Board) -> None:
        fields = self._shown_fields()
        tasks, hidden = self._visible_tasks(fields)
        grouping = self._grouping(tasks)
        board.plan(grouping, tasks)
        ids = [t.id for t in tasks]
        if self._selected_task not in ids:
            self._selected_task = ids[0] if ids else None
        board.show(grouping, {t.id: _card(t, fields) for t in tasks}, self._selected_task)
        self.sub_title = (f"{grouping.title} board · {len(ids)} task(s)"
                          + (f" · {hidden} finished hidden" if hidden else ""))
        if not board.has_focus:
            board.focus()

    def action_toggle_view(self) -> None:
        """v: the table (everything at a glance) or the board (what is where)."""
        self.board_view = not self.board_view
        self._refresh_tasks()
        if not self.board_view:
            self.query_one("#tasks-table", DataTable).focus()

    def action_toggle_groups(self) -> None:
        """G: the table with a heading per group, or one flat list."""
        self.group_rows = not self.group_rows
        self._refresh_tasks()
        self.notify("Grouped by " + self.group_by if self.group_rows else "One flat list.")

    def action_cycle_group(self) -> None:
        """g: group by status, or by any field the project defines — the board's columns and the table's headings."""
        keys = ["status"] + [f.name for f in self.orch.config.task_fields() if f.column]
        self.group_by = keys[(keys.index(self.group_by) + 1) % len(keys)] if self.group_by in keys else "status"
        self._refresh_tasks()
        self.notify(f"Grouped by {self.group_by}.")

    @on(Board.Select)
    def _board_select(self, event: Board.Select) -> None:
        self._selected_task = event.task_id
        self._refresh_tasks()

    @on(Card.Opened)
    def _board_open(self, event: Card.Opened) -> None:
        self._selected_task = event.task_id
        self.action_open_selected()

    @on(Board.Reorder)
    def _board_reorder(self, event: Board.Reorder) -> None:
        self._try(self.orch.move_task, event.task_id, event.delta)

    @on(Board.Move)
    def _board_move(self, event: Board.Move) -> None:
        """shift+← / shift+→: move the task into another column. On a status board that means the status
        change the column stands for; on a field board it sets that field."""
        task = self.orch.state.tasks.get(event.task_id)
        if not task:
            return
        if self.group_by != "status":
            spec = self.orch.config.field(self.group_by)
            value = self._field_after_move(task, spec, event.value, event.was)
            self._try(self.orch.update_task, task.id, fields={self.group_by: value},
                      ok=f"{task.id}: {spec.column or self.group_by} = {spec.show(value) or 'none'}")
            return
        self._move_status(task, event.value)

    def _field_after_move(self, task: Task, spec, to: str, was: str):
        """Dragging a card to another column. A list field (labels) swaps the one value the column stands for
        and keeps the rest; any other field simply takes the new value."""
        to = "" if to == NO_VALUE else to
        if spec.type != "list":
            return to
        kept = [v for v in (task.fields.get(spec.name) or []) if v != was]
        return kept + ([to] if to and to not in kept else [])

    def _move_status(self, task: Task, value: str) -> None:
        if value == task.status:
            return
        if value == TaskStatus.BACKLOG:
            self._try(self.orch.requeue_task, task.id, ok=f"{task.id} is back in the backlog.")
        elif value == TaskStatus.PLANNING:
            self._spawn(task.id)
        elif value == TaskStatus.DONE:
            self._try(self.orch.close_task, task.id, ok=f"{task.id} is done.")
        elif value == TaskStatus.CANCELLED:
            self._try(self.orch.cancel_task, task.id, ok=f"{task.id} is cancelled.")
        else:
            self.notify(f"An agent moves a task to {value}, you cannot. Start one with s.", severity="warning")

    @on(DataTable.RowHighlighted, "#tasks-table")
    def _task_row(self, event: DataTable.RowHighlighted) -> None:
        key = str(event.row_key.value or "") if event.row_key else ""
        if key and not key.startswith(GROUP_PREFIX):
            self._selected_task = key

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
        if task.agent:
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
def _field_cell(field, value) -> Text:
    """A field in the table: labels as chips, everything else as its plain text."""
    if field.type == "list":
        return label_chips(value)
    return wrap(field.show(value), field.width, "cyan")


def _card(t: Task, fields: list) -> Text:
    """One task as it reads on the board: what it is, then its labels, its date and its agent."""
    body = Text()
    body.append(f"{t.id}  ", style="bold")
    body.append(t.priority, style=STATUS_STYLE.get(t.status, "white"))
    body.append("\n")
    body.append(wrap(t.title, CARD_WIDTH).plain + "\n")
    for f in fields:
        value = t.fields.get(f.name)
        if not value:
            continue
        body.append(label_chips(value) if f.type == "list" else Text(f"{f.show(value)}\n", style="cyan"))
        if f.type == "list":
            body.append("\n")
    agent = _agent_cell(t, CARD_WIDTH)
    if agent.plain.strip():
        body.append(agent)
    return body


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
                "Agent": _agent_cell(t).plain,
                "Created": t.created_at, "Updated": t.updated_at}.get(column)
    return value
