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
from textual.message import Message
from textual.screen import ModalScreen
from textual.widgets import DataTable, Footer, Static

from ..daemon import Daemon
from ..models import FINISHED_STATUSES, PRIORITIES, WAITING_STATUSES, Event, Task, TaskStatus
from ..orchestrator import Orchestrator, OrchestratorError
from ..tmux import CONFIG_WINDOW, DASHBOARD_WINDOW, KEY, inside_tmux_session
from .. import usage
from .board import (CARD_WIDTH, NO_VALUE, STATUS_ORDER, TABLE_STATUS_ORDER, Board, Card, field_grouping,
                    label_chips, status_grouping)
from .shared import (AUTO, FLEX, GROUP_PREFIX, HelpScreen, PageApp, PageTable, SearchBar, TitleScreen, edit_task,
                     local_time, wrap)

# Light enough to read on the row's background and on the cursor's tint, so a selected row keeps its colours.
MUTED = "#9aa0a6"
STATUS_STYLE = {
    TaskStatus.BACKLOG: "white", TaskStatus.QUEUED: "cyan", TaskStatus.PLANNING: "yellow",
    TaskStatus.WORKING: "bright_green", TaskStatus.BLOCKED: "#ff6b81", TaskStatus.DONE: "#7fc08a",
    TaskStatus.INTERRUPTED: "#d78fd7", TaskStatus.CANCELLED: MUTED,
}
STARTABLE = WAITING_STATUSES   # backlog, queued, interrupted: s starts one, or queues it when no slot is free
# Columns on a status board you cannot drop a card into: an agent reports these, you do not set them.
AGENT_STATUSES = {str(TaskStatus.WORKING), str(TaskStatus.BLOCKED), str(TaskStatus.INTERRUPTED)}
# (name, width); the Title column takes whatever is left. Fixed widths keep the rows from shifting when a
# bell or a longer status appears — the Agent column, last in the row, is where those show up.
# AUTO columns are as wide as what is in them. Agent and Needs you keep a fixed width: their text changes with
# every bell, and a column that resizes under your eyes is worse than a little empty space.
BASE_COLUMNS = (("ID", AUTO), ("Pri", AUTO), ("Status", AUTO), ("Title", FLEX))
AGENT_COLUMN_SPEC = ("Agent", 18)       # who is on it; a click here starts or opens the agent
STATE_COLUMN_SPEC = ("Needs you", 30)   # what that agent wants from you; a click here opens the agent too
COST_COLUMN_SPEC = ("Cost", AUTO)       # what the task has spent, over every session that worked on it
TIME_COLUMNS = (("Created", AUTO), ("Updated", AUTO))   # last, in this machine's own date format
AGENT_WIDTH = 18
STATE_WIDTH = 30
PHASE_STYLE = {"starting": MUTED, "busy": "yellow", "idle": "green", "ended": MUTED}

HELP_SECTIONS = [
    ("The task you are on", [
        ("enter / click / i", "open its file in your editor"),
        ("click on Agent / Needs you", "open its agent instead — or start one, when none runs yet"),
        ("s", "start an agent on it, or queue it when every slot is busy"),
        ("t", "ask the manager to start it instead, so it knows"),
        ("p", "pause its agent: Esc goes to the session, it stops and waits for you"),
        ("o", "open its agent's window"),
    ]),
    ("Changing a task", [
        ("n", "a new one: you type a title, the file opens in your editor"),
        ("d", "mark it done (its agent is stopped first)"),
        ("x", "delete it, file and all"),
        ("X", "stop its agent and put the task back in the backlog"),
        ("r", "requeue a finished one"),
        ("D", "cancel it"),
        ("c", "close a finished session, or remove the copy of the repo it worked in"),
        ("J / K", "move it down or up the backlog"),
    ]),
    ("What you see", [
        ("v", "the table or the board"),
        ("g", "what it groups by: status, labels, a date, any field you added"),
        ("G", "the headings in the table, on or off"),
        ("h", "the finished tasks, shown or hidden"),
        ("ctrl+w", "search every column (type; esc clears it)"),
        ("click a title", "sort by that column: up, down, then back to the page's own order"),
        ("", "which is running agents first, then queued, then priority"),
    ]),
    ("On the board", [
        ("arrows", "move the selection between cards and columns"),
        ("shift+← →", "move the task itself: to another status, or to another label"),
        ("shift+↑ ↓", "move it up or down its column"),
        ("drag a card", "the same two moves with the mouse: hold it, and the column you are over"),
        ("", "lights up with a line where it will land — let go to drop it there"),
        ("", "cards keep the order you put them in; the table sorts its own way"),
    ]),
    ("The workspace", [
        ("ctrl+a  ← →", "the next page: manager → tasks → agents → config"),
        (",", "straight to the config page"),
        ("m", "start or stop the manager"),
        ("+ / -", "how many agents may run at once"),
        ("q", "leave: the manager and the agents keep running"),
        ("Q  ctrl+c ctrl+c", "stop everything: the manager, the agents, the workspace"),
    ]),
]
HELP_NOTE = ("In the bar at the bottom, `agents` lights up while you are inside an agent's window — click a name "
             "there to jump to it. Inside a session, every key but ctrl+a belongs to Claude or Codex.")

class FinishedStrip(Static):
    """The line above the keys: how many finished tasks there are, and whether they are shown. Click it or
    press h. It stays out of the table, so the list itself is only tasks."""

    DEFAULT_CSS = """
    FinishedStrip { height: 1; padding: 0 1; color: $text-muted; background: $panel; }
    FinishedStrip:hover { color: $text; }
    """

    class Clicked(Message):
        pass

    def show(self, count: int, expanded: bool) -> None:
        self.display = bool(count)
        if count:
            arrow, what = ("▾", "hide") if expanded else ("▸", "show")
            self.update(f"{arrow} {count} finished — h or click to {what} them")

    def on_click(self) -> None:
        self.post_message(self.Clicked())


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


# ---------------------------------------------------------------------------------------------- app
class SupermanagerApp(PageApp):
    CSS_PATH = "app.tcss"
    TITLE = "supermanager"
    PAGE = DASHBOARD_WINDOW
    BINDINGS = [
        Binding("n,N", "new_task", "New task"),
        Binding("enter", "open_selected", "Open"),
        Binding("s", "spawn_selected", "Start/queue"),
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
        self._page_settings = self._settings_from_config()   # what config.toml said last time we looked
        self.show_done = self._page_settings["show_done"]     # h flips it for this session only
        self.board_view = self._page_settings["board_view"]   # v
        self.group_by = self._page_settings["group_by"]       # g: "status", or one of the project's own fields
        self.group_rows = self._page_settings["group_rows"]   # G: headings in the table, on by default
        self.sub_title = orch.config.project_name

    @property
    def tmux_session(self) -> str:
        return self.orch.config.tmux_session

    # ----------------------------------------------------------------- layout
    def compose(self) -> ComposeResult:
        yield PageTable(id="tasks-table")   # its action column is set on every render (fields shift it)
        yield Board(id="tasks-board")
        yield SearchBar()
        yield FinishedStrip()
        yield Footer()

    async def on_mount(self) -> None:
        await self.daemon.start()
        self.orch.subscribe(self._events.put)
        self.orch.on_exit_request = self._exit_requested
        self.orch.reconcile(startup=True)
        self.run_worker(self._boot, thread=True)
        self.refresh_all()
        self.set_interval(0.5, self._drain_events)
        self.set_interval(1.0, self._follow_files)
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

    @work(thread=True, exclusive=True, group="follow")
    def _follow_files(self) -> None:
        """A task file or config.toml edited by hand — in your editor, by the manager, by git — shows up here
        within a second. (A change made through the daemon arrives as an event and needs no polling.)"""
        if self.orch.follow_files():
            self.call_from_thread(self.refresh_all)

    def refresh_all(self) -> None:
        self._follow_settings()
        self.orch.update_bar_counts()
        self._refresh_tasks()

    def _settings_from_config(self) -> dict:
        t = self.orch.config.tasks
        return {"show_done": not t.hide_done, "board_view": t.view == "board", "group_by": t.group_by,
                "group_rows": t.group_rows}

    def _follow_settings(self) -> None:
        """tasks.view, group_by, group_rows, hide_done changed on the config page or in the file: the page
        takes the new value. Only the ones that changed — v, g, G and h set the rest for this session, and a
        change to some other setting must not undo them."""
        now = self._settings_from_config()
        for name, value in now.items():
            if value != self._page_settings[name]:
                setattr(self, name, value)
        if now["board_view"] != self._page_settings["board_view"] and not self.board_view:   # as v does
            self.call_after_refresh(self.query_one("#tasks-table", DataTable).focus)
        self._page_settings = now

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
            if not board.dragging:   # a redraw mid-drag would take the card out of your hand
                self._refresh_board(board)
            return
        previous = self._selected_task
        fields = self._shown_fields()
        columns = [*BASE_COLUMNS, *[(f.column, AUTO) for f in fields], AGENT_COLUMN_SPEC, STATE_COLUMN_SPEC,
                   COST_COLUMN_SPEC, *TIME_COLUMNS]
        agent_column = columns.index(AGENT_COLUMN_SPEC)   # the project's own fields shift it along
        table.action_columns = (agent_column, agent_column + 1)   # Needs you sits right after
        table.clear(columns=True)
        tasks, hidden = self._visible_tasks(fields)
        # The groups are settled before the columns are: a heading sits in the first column, so that column has
        # to be wide enough for the longest one.
        live = [t for t in tasks if t.status not in FINISHED_STATUSES]
        finished = [t for t in tasks if t.status in FINISHED_STATUSES]
        sections = self._sections(live)
        if finished:   # finished tasks are their own group at the very bottom, whatever the rest is grouped by
            sections.append(("finished", finished))
        self.add_columns(table, *columns, content={
            "ID": [t.id for t in tasks] + [_heading(label, len(rows)) for label, rows in sections if label],
            "Pri": [t.priority for t in tasks],
            "Status": [str(t.status) for t in tasks],
            **{f.column: [_field_cell(f, t.fields.get(f.name)) for t in tasks] for f in fields},
            "Cost": [_cost_cell(t, self.orch).plain for t in tasks],
            "Created": [local_time(t.created_at) for t in tasks],
            "Updated": [local_time(t.updated_at) for t in tasks],
        })
        width = self.flex_width
        filler = [""] * (len(fields) + len(TIME_COLUMNS) + 2)   # +2: the Needs you and Cost columns

        def row(t: Task) -> None:
            table.add_row(t.id, t.priority, Text(t.status, style=STATUS_STYLE.get(t.status, "white")),
                          wrap(t.title, width),
                          *(_field_cell(f, t.fields.get(f.name)) for f in fields),
                          _agent_cell(t, AGENT_WIDTH), _state_cell(t, STATE_WIDTH), _cost_cell(t, self.orch),
                          Text(local_time(t.created_at), style=MUTED), Text(local_time(t.updated_at), style=MUTED),
                          key=t.id, height=None)

        def heading(label: str, count: int) -> None:
            """A heading row reads from the left edge, in the first column, with the rest of the row empty."""
            table.add_row(Text(_heading(label, count), style="bold reverse"), *[""] * (len(columns) - 1),
                          key=GROUP_PREFIX + label)

        for label, in_group in sections:
            if label:
                heading(label, len(in_group))
            for t in in_group:
                row(t)
        if not tasks:
            hint = ("No task matches the search." if self.search_text
                    else "No tasks yet: n creates one, or tell the manager what you want.")
            table.add_row("", "", "", Text(hint, style="dim"), *filler, "")
        self.query_one(FinishedStrip).show(hidden or len(finished), self.show_done)
        ids = [str(r.key.value) for r in table.ordered_rows]
        if previous not in ids:
            previous = next((i for i in ids if not i.startswith(GROUP_PREFIX)), None)
        self._selected_task = previous if previous and not previous.startswith(GROUP_PREFIX) else None
        if self._selected_task:
            table.move_to_task(ids.index(self._selected_task))

    def _sections(self, live: list[Task]) -> list[tuple[str, list[Task]]]:
        """The table's groups, in order, each with the tasks under it. One nameless group when G is off.

        A task can carry several labels; in a list it belongs under one heading, the first of them."""
        if not (self.group_rows and live):
            return [("", live)]
        grouping = self._grouping(live, TABLE_STATUS_ORDER)
        groups = [(value, [t for t in live if grouping.of(t)[0] == value]) for value in grouping.values]
        return [(value, in_group) for value, in_group in groups if in_group]

    # ------------------------------------------------------------------ board
    def _grouping(self, tasks: list[Task], order: tuple = STATUS_ORDER):
        """What the groups are: the statuses, or the values of one of the project's fields."""
        field = next((f for f in self.orch.config.task_fields() if f.name == self.group_by), None)
        return field_grouping(field, tasks) if field else status_grouping(tasks, order)

    def _refresh_board(self, board: Board) -> None:
        """The board keeps the backlog's own order, unless a column is sorted: a card you drag somewhere has
        to stay there. (The table is the one that floats running agents to the top.)"""
        fields = self._shown_fields()
        tasks, hidden = self._visible_tasks(fields)
        if not self.sort:
            place = {task_id: i for i, task_id in enumerate(self.orch.state.order)}
            tasks.sort(key=lambda t: place.get(t.id, len(place)))
        grouping = self._grouping(tasks)
        board.locked = AGENT_STATUSES if self.group_by == "status" else set()
        board.plan(grouping, tasks)
        ids = [t.id for t in tasks]
        if self._selected_task not in ids:
            self._selected_task = ids[0] if ids else None
        board.show(grouping, {t.id: _card(t, fields, self.orch) for t in tasks}, self._selected_task)
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

    @on(Board.Drop)
    def _board_drop(self, event: Board.Drop) -> None:
        """A card let go somewhere, by the mouse or by shift+↑↓: it takes that spot in the backlog, and — when
        it came from another column — whatever that column stands for."""
        task = self.orch.state.tasks.get(event.task_id)
        if not task:
            return
        self._selected_task = task.id
        if event.value != event.was and not self._enter_column(task, event.value, event.was):
            return   # the column would not take it: leave its place in the backlog alone too
        if task.id not in (event.before, event.after):
            self._try(self.orch.place_task, task.id, event.before, event.after)

    @on(Board.Move)
    def _board_move(self, event: Board.Move) -> None:
        """shift+← / shift+→: move the task into another column, keeping its place inside it."""
        task = self.orch.state.tasks.get(event.task_id)
        if task:
            self._selected_task = task.id
            self._enter_column(task, event.value, event.was)

    def _enter_column(self, task: Task, value: str, was: str) -> bool:
        """What landing in a column means. On a status board it is the status change the column stands for;
        on a field board it sets that field. False when the column will not take the task."""
        if self.group_by != "status":
            spec = self.orch.config.field(self.group_by)
            new = self._field_after_move(task, spec, value, was)
            return self._try(self.orch.update_task, task.id, fields={self.group_by: new},
                             ok=f"{task.id}: {spec.column or self.group_by} = {spec.show(new) or 'none'}")
        return self._move_status(task, value)

    def _field_after_move(self, task: Task, spec, to: str, was: str):
        """Dragging a card to another column. A list field (labels) swaps the one value the column stands for
        and keeps the rest; any other field simply takes the new value."""
        to = "" if to == NO_VALUE else to
        if spec.type != "list":
            return to
        kept = [v for v in (task.fields.get(spec.name) or []) if v != was]
        return kept + ([to] if to and to not in kept else [])

    def _move_status(self, task: Task, value: str) -> bool:
        """The status a column stands for. False when that is not yours to set: blocked, working and
        interrupted are what an agent reports, not somewhere you can put a card."""
        if value == task.status:
            return True
        if value == TaskStatus.BACKLOG:
            return self._try(self.orch.requeue_task, task.id, ok=f"{task.id} is back in the backlog.")
        if value in (TaskStatus.QUEUED, TaskStatus.PLANNING):
            self._spawn(task.id)
            return True
        if value == TaskStatus.DONE:
            return self._try(self.orch.close_task, task.id, ok=f"{task.id} is done.")
        if value == TaskStatus.CANCELLED:
            return self._try(self.orch.cancel_task, task.id, ok=f"{task.id} is cancelled.")
        self.notify(f"An agent moves a task to {value}, you cannot. Start one with s.", severity="warning")
        return False

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
        """A click on the Agent or Needs you cell: starts an agent on a waiting task, opens the agent of a
        running one. Every other cell opens the task file instead."""
        self._selected_task = event.row_key.value
        task = self._current_task()
        if task and task.status in STARTABLE:
            self._spawn(task.id)
        else:
            self.action_open_agent()

    def _current_task(self) -> Task | None:
        return self.orch.state.tasks.get(self._selected_task) if self._selected_task else None

    # ---------------------------------------------------------------- actions
    def _try(self, fn, *args, ok: str | None = None, **kwargs) -> bool:
        """Run something on the orchestrator and say so when it refuses. True when it went through."""
        done = True
        try:
            fn(*args, **kwargs)
            if ok:
                self.notify(ok)
        except OrchestratorError as exc:
            self.notify(str(exc), severity="error", timeout=8)
            done = False
        self.refresh_all()
        return done

    def action_toggle_done(self) -> None:
        """h, or a click on the strip above the keys: show or hide the finished tasks. They sit in one group at
        the bottom of the list. The starting state comes from tasks.hide_done."""
        self.show_done = not self.show_done
        self._refresh_tasks()

    @on(FinishedStrip.Clicked)
    def _strip_clicked(self) -> None:
        self.action_toggle_done()

    def action_help(self) -> None:
        self.push_screen(HelpScreen(f"{self.orch.config.project_name} · the tasks page", HELP_SECTIONS, HELP_NOTE))

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
        """enter / click on a row: the task file opens in your editor. The agent is one column over — click
        Agent or Needs you, or press o."""
        task = self._current_task()
        if task:
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
        """s: start an agent on the task and go into its window — or, when every slot is busy, put the task in
        the queue; it starts by itself as soon as one frees."""
        try:
            task = self.orch.spawn_agent(task_id)
        except OrchestratorError as exc:
            self.call_from_thread(self.notify, str(exc), severity="error", timeout=8)
            self.call_from_thread(self.refresh_all)
            return
        self.call_from_thread(self.refresh_all)
        self.call_from_thread(self._select_task, task.id)
        if task.status == TaskStatus.QUEUED:
            self.call_from_thread(self.notify, f"{task.id} is queued — it starts when a slot frees.")
        elif task.agent:
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
        self._move_in_backlog(1)

    def action_move_up(self) -> None:
        self._move_in_backlog(-1)

    def _move_in_backlog(self, delta: int) -> None:
        """J / K: one step down or up. On the board that means one card inside the column, which is what you
        see; in the table it is one row of the backlog."""
        if not self._current_task():
            return
        if self.board_view:
            self.query_one(Board).action_reorder(delta)
            return
        self._try(self.orch.move_task, self._current_task().id, delta)

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


def _card(t: Task, fields: list, orch) -> Text:
    """One task as it reads on the board: what it is, then its labels, its date, its agent and what it spent."""
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
    for cell in (_agent_cell(t, CARD_WIDTH), _state_cell(t, CARD_WIDTH), _cost_cell(t, orch)):
        if cell.plain.strip():
            body.append(cell)
            body.append("\n")
    return body


def _agent_cell(t: Task, width: int = 200) -> Text:
    """The Agent column: who is on it, or what you can do about it."""
    a = t.agent
    if t.status == TaskStatus.QUEUED:
        return Text("⏳ queued", style="cyan")
    if t.status in STARTABLE:
        return Text("▶ start (s)", style="cyan")
    if a and a.session_open:
        with_lead = f" · with {a.lead}" if a.lead else ""   # riding on another task's session (same group)
        return wrap((a.rc_name or f"{a.tool} {t.id}") + with_lead, width, "yellow")
    return wrap(a.branch, width, MUTED) if a and a.branch else Text("")


def _state_cell(t: Task, width: int = 200) -> Text:
    """The Needs you column: what that agent is doing, and what it wants from you when it wants something."""
    a = t.agent
    if t.status == TaskStatus.QUEUED:
        return Text("starts when a slot frees", style="cyan")
    if a and a.session_open:
        if a.attention:
            return wrap(f"🔔 {a.attention}", width, "bold yellow")
        return Text(a.phase, style=PHASE_STYLE.get(a.phase, "dim"))
    if t.status in STARTABLE:
        return Text("")
    return Text(str(t.status), style=STATUS_STYLE.get(t.status, "dim"))


def _cost_cell(t: Task, orch) -> Text:
    """The Cost column: what this task has spent so far. It turns amber past four fifths of its budget and red
    once it is over, so a task about to run out is visible before it does."""
    spent = t.usage or {}
    cost, count = float(spent.get("cost", 0.0)), usage.tokens(spent)
    if not count:
        return Text("")
    shown = usage.money(cost, bool(spent.get("priced", True))) or usage.short(count)
    limit_tokens, limit_usd = orch.budget_of(t)
    share = max((count / limit_tokens) if limit_tokens else 0.0, (cost / limit_usd) if limit_usd else 0.0)
    style = "bold red" if t.budget_hit or share >= 1 else "yellow" if share >= 0.8 else MUTED
    return Text(shown, style=style)


def _heading(label: str, count: int) -> str:
    return f"{label} ({count})"


def _default_order(t: Task) -> tuple:
    """Live agents first, then what you asked to start, then by priority. Same rank keeps the backlog order."""
    rank = 0 if t.agent and t.agent.session_open else (1 if t.status == TaskStatus.QUEUED else 2)
    return (rank, PRIORITIES.index(t.priority) if t.priority in PRIORITIES else len(PRIORITIES))


def _sort_value(fields: list):
    """How each column sorts, the project's own fields included."""
    def value(t: Task, column: str) -> object:
        for f in fields:
            if f.column == column:
                return f.show(t.fields.get(f.name))
        return {"ID": t.id, "Pri": t.priority, "Status": str(t.status), "Title": t.title,
                "Agent": _agent_cell(t).plain, "Needs you": _state_cell(t).plain,
                "Cost": -float((t.usage or {}).get("cost", 0.0)),
                "Created": t.created_at, "Updated": t.updated_at}.get(column)
    return value
