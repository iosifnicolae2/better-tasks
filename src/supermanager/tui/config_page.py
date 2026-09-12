"""The config page: one line per setting, like a classic terminal settings list; a change is saved at once.

Runs in its own tmux window (`supermanager config-page`). Changes go through the daemon when it is up
(so it can react, e.g. to a new concurrency), otherwise straight into config.toml.
"""

from __future__ import annotations

from rich.text import Text
from textual import on
from textual.app import ComposeResult
from textual.binding import Binding
from textual.widgets import DataTable, Footer, Input, Static

from ..client import DaemonClient, DaemonError, DaemonUnavailable
from ..config import SETTABLE_KEYS, SETTING_HELP, get_key, load_config, local_keys, save_config, set_key
from ..paths import ProjectPaths
from ..tmux import CONFIG_WINDOW, Tmux, inside_tmux_session
from .shared import FLEX, PageApp, PageTable, SearchBar, wrap

COLUMNS = (("Setting", 30), ("Value", 20), ("What it does", FLEX))


def _shown(key: str, value: object) -> Text:
    if SETTABLE_KEYS[key] is bool:
        return Text("[x] on ", style="green") if value else Text("[ ] off", style="dim")
    return Text(str(value)) if str(value) else Text("(empty)", style="dim")


class ConfigApp(PageApp):
    CSS_PATH = "config_page.tcss"
    TITLE = "supermanager config"
    PAGE = CONFIG_WINDOW
    BINDINGS = [
        Binding("enter,space", "edit", "Toggle / edit"),
        Binding("q", "detach", "Leave"),
    ]

    def __init__(self, paths: ProjectPaths):
        super().__init__()
        self.paths = paths
        self.config = load_config(paths.config)
        self.client = DaemonClient(paths.socket)
        self.selected: str | None = None
        self.editing: str | None = None

    @property
    def tmux_session(self) -> str:
        return self.config.tmux_session

    def compose(self) -> ComposeResult:
        yield PageTable(id="settings")
        yield Input(id="editor", placeholder="new value, enter saves, esc cancels")
        yield Static("", id="status")
        yield SearchBar()
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#editor", Input).display = False
        self._render()

    def rerender(self) -> None:
        self._render()

    def _render(self) -> None:
        table = self.query_one(DataTable)
        table.clear(columns=True)
        self.add_columns(table, *COLUMNS)
        width = self.flex_width
        keys = [k for k in SETTABLE_KEYS if self.matches(k, str(get_key(self.config, k)), SETTING_HELP.get(k, ""))]
        keys = self.sorted_rows(keys, lambda k, column: {"Setting": k, "Value": str(get_key(self.config, k)),
                                                          "What it does": SETTING_HELP.get(k, "")}.get(column))
        overridden = local_keys(self.paths.config)
        for key in keys:
            help_text = SETTING_HELP.get(key, "")
            if key in overridden:
                help_text = f"[from config.local.toml] {help_text}"
            table.add_row(key, _shown(key, get_key(self.config, key)), wrap(help_text, width, "dim"),
                          key=key, height=None)
        if self.selected in keys:
            table.move_cursor(row=keys.index(self.selected))

    # ------------------------------------------------------------------ edit
    @on(DataTable.RowHighlighted)
    def _row(self, event: DataTable.RowHighlighted) -> None:
        self.selected = str(event.row_key.value) if event.row_key else None

    @on(DataTable.RowSelected)
    def _row_chosen(self, event: DataTable.RowSelected) -> None:
        self.action_edit()

    def action_edit(self) -> None:
        key = self.selected
        if not key or self.editing:
            return
        if SETTABLE_KEYS[key] is bool:
            self._save(key, str(not get_key(self.config, key)))
            return
        self.editing = key
        editor = self.query_one("#editor", Input)
        editor.value = str(get_key(self.config, key))
        editor.type = "integer" if SETTABLE_KEYS[key] is int else "text"
        editor.display = True
        editor.focus()
        self._status(f"[b]{key}[/b]: type the new value")

    @on(Input.Submitted, "#editor")
    def _typed(self, event: Input.Submitted) -> None:
        key, value = self.editing, event.value.strip()
        self.action_cancel_edit()
        if key:
            self._save(key, value)

    def action_clear_search(self) -> None:
        """esc: first closes the value editor, otherwise clears the search."""
        if self.editing:
            self.action_cancel_edit()
            return
        super().action_clear_search()

    def action_cancel_edit(self) -> None:
        self.editing = None
        editor = self.query_one("#editor", Input)
        editor.display = False
        self.query_one(DataTable).focus()

    def _save(self, key: str, value: str) -> None:
        if str(value) == str(get_key(self.config, key)):
            return
        try:
            try:
                self.client.call("set_config", key=key, value=value, timeout=5.0)
            except DaemonUnavailable:   # no daemon: write the file ourselves
                set_key(self.config, key, value)
                save_config(self.paths.config, self.config)
        except (DaemonError, KeyError, ValueError) as exc:
            self._status(f"[red]{exc}[/red]")
            return
        self.config = load_config(self.paths.config)
        self._render()
        self._status(f"[green]saved[/green] {key} = {get_key(self.config, key)}")

    def _status(self, text: str) -> None:
        self.query_one("#status", Static).update(text)

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
            Tmux(self.config.tmux_session).detach()
        else:
            self.exit()
