"""The agents page: the running agent sessions, live — one row per agent, and every notice about them (a plan
waiting for approval, a question, a finished or interrupted task). Task agents (T-…) show the task they work on
and how far it is (planning → working); free agents (A-…) have none. The Tool column says what runs there.

enter or a click opens the agent's window, i edits its task file, n starts a new free agent, x stops it.

Runs in its own tmux window (`supermanager agents-page`) and asks the daemon for the agent list twice a second.
"""

from __future__ import annotations

import time
from pathlib import Path

from rich.text import Text
from textual import on
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Vertical
from textual.screen import ModalScreen
from textual.widgets import DataTable, Footer, Static

from ..client import DaemonClient, DaemonError, DaemonUnavailable
from ..config import load_config
from ..paths import ProjectPaths
from ..tmux import AGENTS_WINDOW, Tmux, inside_tmux_session
from .shared import AUTO, FLEX, PageApp, PageTable, SearchBar, edit_task, wrap

PHASE_STYLE = {"starting": "dim", "busy": "yellow", "idle": "green", "ended": "dim"}
STATUS_STYLE = {"planning": "yellow", "working": "bright_green", "blocked": "bright_red", "done": "green",
                "interrupted": "magenta", "cancelled": "dim"}
# (name, width): AUTO fits the column to what is in it, FLEX takes whatever is left of the row. Widths are
# settled when the list of agents changes, not on every refresh, so nothing shifts while you read.
COLUMNS = (("Agent", AUTO), ("Phase", AUTO), ("Task", FLEX), ("Status", AUTO),
           ("Branch", AUTO), ("Started", AUTO), ("Active", AUTO), ("Needs you", AUTO))
PHASE_COLUMN = 1   # a click on the phase cell opens the agent
FLEX_COLUMN = next(i for i, (_, width) in enumerate(COLUMNS) if width is FLEX)   # where a hint line goes
NOTICE_KINDS = {"done": "information", "blocked": "warning", "interrupted": "warning", "error": "error",
                "attention": "warning"}   # events that pop up here; the tasks page stays quiet


def _age(ts: float) -> str:
    seconds = int(time.time() - ts)
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m"
    return f"{seconds // 3600}h{(seconds % 3600) // 60:02d}m"


class ConfirmScreen(ModalScreen[bool]):
    BINDINGS = [Binding("escape,n", "dismiss(False)", "No"), Binding("y", "dismiss(True)", "Yes")]
    DEFAULT_CSS = ("ConfirmScreen { align: center middle; } ConfirmScreen #confirm { width: 70; height: auto; "
                   "border: thick $warning; background: $surface; padding: 1 2; }")

    def __init__(self, question: str):
        super().__init__()
        self.question = question

    def compose(self) -> ComposeResult:
        with Vertical(id="confirm"):
            yield Static(self.question)
            yield Static("[dim]y yes · n / esc no[/dim]")


class AgentsApp(PageApp):
    CSS = "Screen { layout: vertical; } #agents-table { height: 1fr; }"
    TITLE = "supermanager agents"
    PAGE = AGENTS_WINDOW
    BINDINGS = [
        Binding("n,N", "new_agent", "New agent"),
        Binding("enter", "open_agent", "Open"),
        Binding("i", "edit_task", "Edit task"),
        Binding("x", "stop_selected", "Stop"),
        Binding("q", "detach", "Leave"),
        Binding("o", "open_agent", "Open agent", show=False),
    ]

    def __init__(self, paths: ProjectPaths):
        super().__init__()
        self.paths = paths
        self.config = load_config(paths.config)
        self.client = DaemonClient(paths.socket)
        self.tmux = Tmux(self.config.tmux_session)
        self.sessions: list[dict] = []
        self.windows: dict[str, str] = {}   # session id (T-… or A-…) -> its tmux window
        self.with_task: set[str] = set()     # sessions that belong to a task (i edits the task file)
        self.selected: str | None = None
        self.shown: list[str] | None = None   # session ids currently in the table, in order
        self.columns: list = []
        self.events_seen = time.time()        # only notices from now on

    @property
    def tmux_session(self) -> str:
        return self.config.tmux_session

    def compose(self) -> ComposeResult:
        yield PageTable(id="agents-table", action_columns=(PHASE_COLUMN,))
        yield SearchBar()
        yield Footer()

    def on_mount(self) -> None:
        self._poll()
        self.set_interval(0.5, self._poll)
        self.set_interval(1.0, self._poll_events)

    def _poll(self) -> None:
        try:
            self.sessions = self.client.call("list_agents", timeout=3.0)
        except (DaemonError, DaemonUnavailable):
            return
        self._render()

    def _poll_events(self) -> None:
        """Notices live here: an agent needs you, a task finished, a session died."""
        try:
            events = self.client.call("events_since", ts=self.events_seen, timeout=3.0)
        except (DaemonError, DaemonUnavailable):
            return
        for event in events:
            self.events_seen = max(self.events_seen, event["ts"])
            severity = NOTICE_KINDS.get(event["kind"])
            if not severity:
                continue
            text = f"🔔 {event['message']}" if event["kind"] == "attention" else event["message"]
            self.notify(text[:160], severity=severity, timeout=10)

    def rerender(self) -> None:
        self.shown = None   # a new search or sort: rebuild the table
        self._render()

    def _render(self) -> None:
        """Rows are updated in place; the table is only rebuilt when the set or order of agents changes
        (so clicks, the cursor and the column widths hold)."""
        table = self.query_one(DataTable)
        sessions = [s for s in self.sessions if self.matches(*self._cells(s, 200))]
        if self.sort:
            sessions = self.sorted_rows(sessions, _sort_value)
        else:
            sessions.sort(key=lambda s: -s["agent"]["started_at"])   # newest agent on top
        self.windows = {s["id"]: s["agent"]["tmux_window"] for s in sessions}
        self.with_task = {s["id"] for s in sessions if s["task"]}
        ids = [s["id"] for s in sessions]
        if ids != self.shown:
            table.clear(columns=True)
            content = {name: [self._cells(s, 200)[i] for s in sessions] for i, (name, _) in enumerate(COLUMNS)}
            self.columns = self.add_columns(table, *COLUMNS, content=content)   # also sets flex_width
            self.shown = ids
            for s in sessions:
                table.add_row(*self._cells(s, self.flex_width), key=s["id"], height=None)
            if not sessions:
                hint = "No agent matches the search." if self.query else "No agent is running: n starts one, s on the tasks page starts one on a task."
                cells = [""] * len(COLUMNS)
                cells[FLEX_COLUMN] = wrap(hint, self.flex_width, "dim")
                table.add_row(*cells, height=None)
            if self.selected in ids:
                table.move_cursor(row=ids.index(self.selected))
            return
        for s in sessions:
            for column, cell in zip(self.columns, self._cells(s, self.flex_width)):
                table.update_cell(s["id"], column, cell)

    @staticmethod
    def _cells(s: dict, width: int) -> tuple:
        """One row. What the agent runs with (claude/codex, model, effort) is not here: it is in the task file
        and in the events; this page is about what each session is doing."""
        a = s["agent"]
        phase = a["phase"]
        task = wrap(f"{s['id']}  {s['title']}", width) if s["task"] else Text("no task · project root", style="dim")
        status = s.get("status", "")
        return (Text(a["rc_name"] or s["id"], style="bold"),
                Text(phase, style=PHASE_STYLE.get(phase, "dim")), task,
                Text(status, style=STATUS_STYLE.get(status, "dim")),
                Text(a["branch"] or ""), Text(_age(a["started_at"])), Text(_age(a["last_activity"])),
                Text(f"🔔 {a['attention']}" if a["attention"] else "", style="bold yellow"))

    @on(DataTable.RowHighlighted, "#agents-table")
    def _row_highlighted(self, event: DataTable.RowHighlighted) -> None:
        self.selected = str(event.row_key.value) if event.row_key and event.row_key.value else None

    @on(DataTable.RowSelected, "#agents-table")
    def _row_selected(self) -> None:
        self.action_open_agent()

    @on(PageTable.CellClicked)
    def _phase_clicked(self, event: PageTable.CellClicked) -> None:
        self.selected = str(event.row_key.value)
        self.action_open_agent()

    def action_edit_task(self) -> None:
        """i: the task file opens in your editor (a free agent has none)."""
        if not self.selected:
            return
        if self.selected in self.with_task:
            edit_task(self, self.config.tasks.editor, self._task_file(self.selected))
        else:
            self.notify("This agent has no task file.", severity="warning")

    def action_open_agent(self) -> None:
        """enter / click: jump to the agent's window."""
        window = self.windows.get(self.selected or "")
        if not window:
            self.notify("This agent has no open window.", severity="warning")
            return
        try:
            self.client.call("acknowledge", target=self.selected, timeout=3.0)
        except (DaemonError, DaemonUnavailable):
            pass
        if inside_tmux_session(self.config.tmux_session):
            self.tmux.select_window(window)
        else:
            self.notify("Open the agent from inside the supermanager tmux session (`supermanager attach`).")

    def action_stop_selected(self) -> None:
        """x: stop the agent. A task agent's task goes back to the backlog."""
        agent_id = self.selected
        if not agent_id or agent_id not in self.windows:
            self.notify("Select a running agent first.", severity="warning")
            return
        if agent_id in self.with_task:
            question, op, args = (f"Stop the agent of {agent_id} and put the task back in the backlog?",
                                  "stop_agent", {"task_id": agent_id, "requeue": True})
        else:
            question, op, args = f"Stop agent {agent_id}?", "stop_free_agent", {"agent_id": agent_id}

        def go(yes: bool) -> None:
            if not yes:
                return
            try:
                self.client.call(op, timeout=10.0, **args)
            except (DaemonError, DaemonUnavailable) as exc:
                self.notify(str(exc), severity="error", timeout=8)
            self._poll()
        self.push_screen(ConfirmScreen(question), go)

    # ------------------------------------------------------------------- new
    def action_new_agent(self) -> None:
        """n: a new session in the project root (the config's default tool), not tied to any task."""
        self.notify("Starting a new agent…")
        self.run_worker(self._spawn_free_agent, thread=True, exit_on_error=False)

    def _spawn_free_agent(self) -> None:
        try:
            agent = self.client.call("spawn_free_agent", timeout=60.0)
        except (DaemonError, DaemonUnavailable) as exc:
            self.call_from_thread(self.notify, str(exc), severity="error", timeout=8)
            return
        self.call_from_thread(self._show_new_agent, agent)

    def _show_new_agent(self, agent: dict) -> None:
        """The new row is selected; you stay on this page (enter or a click opens the agent)."""
        self.selected = agent["id"]
        self._poll()
        self.notify(f"Agent {agent['id']} started. enter opens it.")

    def _task_file(self, task_id: str) -> Path:
        return self.paths.tasks_dir(self.config.tasks.path) / f"{task_id}.md"

    def quit_all(self) -> None:
        """Ask the daemon to stop everything (it also closes the tmux workspace, this window included).
        Without a daemon there is nothing to stop: close the workspace ourselves."""
        try:
            self.client.call("quit_all", why=f"ctrl+c on the {self.TITLE.split()[-1]} page", timeout=5.0)
        except (DaemonError, DaemonUnavailable):
            if inside_tmux_session(self.config.tmux_session):
                Tmux(self.config.tmux_session)._run("kill-session", "-t", self.config.tmux_session, check=False)
            self.exit()

    def action_detach(self) -> None:
        if inside_tmux_session(self.config.tmux_session):
            self.tmux.detach()
        else:
            self.exit()


def _sort_value(s: dict, column: str) -> object:
    a = s["agent"]
    return {"Agent": a["rc_name"] or s["id"], "Phase": a["phase"],
            "Task": s["id"] if s["task"] else "", "Status": s.get("status", ""), "Branch": a["branch"] or "",
            "Started": -a["started_at"], "Active": -a["last_activity"], "Needs you": a["attention"]}.get(column)
