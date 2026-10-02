"""The config page: a tab per section, one line per setting inside it; a change is saved at once.

Runs in its own tmux window (`supermanager config-page`). Changes go through the daemon when it is up
(so it can react, e.g. to a new concurrency), otherwise straight into config.toml.
"""

from __future__ import annotations

from rich.text import Text
from textual import on
from textual.app import ComposeResult
from textual.binding import Binding
from textual.widgets import DataTable, Footer, Input, Static, Tab, Tabs

from ..client import DaemonClient, DaemonError, DaemonUnavailable
from ..config import (NO_VALUE, SETTABLE_KEYS, SETTING_HELP, Config, config_stamp, get_key, key_choices,
                      load_config, local_keys, override_note, save_config, set_key)
from ..paths import ProjectPaths
from ..tmux import CONFIG_WINDOW, Tmux, inside_tmux_session
from .shared import AUTO, FLEX, GROUP_PREFIX, HelpScreen, PageApp, PageTable, SearchBar, wrap

COLUMNS = (("Setting", AUTO), ("Value", AUTO), ("What it does", FLEX))
SECTIONS = ("manager", "tasks", "agents", "auto", "remote", "power")   # the ones you reach for; anything else follows, in name order
HELP_SECTIONS = [
    ("The setting you are on", [
        ("enter / space", "a switch flips, a setting with set values takes the next one, anything else opens a "
                          "line to type in"),
        ("← →", "step through the values a setting can take; on any other setting they go to the next page"),
        ("enter", "save what you typed"),
        ("esc", "leave it as it was"),
    ]),
    ("This page", [
        ("tab / shift+tab", "the next section, or the one before it — a click on its name does the same"),
        ("ctrl+w", "search: every section at once, whichever tab you are on"),
        ("click a title", "sort by that column; the sections come back when you sort again"),
    ]),
    ("The workspace", [
        ("ctrl+a", "the next page: manager → tasks → agents → config (so do ← →, unless the setting you "
                   "are on has a set of values)"),
        ("q", "leave: everything keeps running"),
        ("ctrl+c ctrl+c", "stop everything: the manager, the agents, the workspace"),
    ]),
]
HELP_NOTE = ("A change is saved the moment you make it, in .supermanager/config.toml. A setting marked "
             "[from config.local.toml] is overridden by your own file, and that is what runs.")
SEARCHING_ABOUT = "every section — what you typed in the search line"
WATCH_EVERY = 2.0   # seconds between checks that config.toml still says what the page shows
SECTION_ABOUT = {
    "manager": "the Claude that plans and dispatches — it never edits your code",
    "tasks": "the backlog: where the task files live, what they carry, how the page shows them",
    "agents": "what runs the work: how many, on what, in which copy of the repo, and what happens when they finish",
    "remote": "your phone: starting a session in this project from the Claude app, and seeing it here",
    "auto": "which steps happen without you — all off, so you approve every plan and every merge",
    "power": "the machine: awake while agents work, screen out when you walk away",
    "notify": "how it asks for you",
    "tmux": "the workspace itself",
}


def _sections(keys: list[str]) -> list[str]:
    """The sections that have something to show: the ones worth reaching for first, then the rest by name."""
    here = {k.split(".", 1)[0] for k in keys}
    return [s for s in SECTIONS if s in here] + sorted(here - set(SECTIONS))


def _sort_value(config):
    def value(key: str, column: str) -> object:
        return {"Setting": key, "Value": str(get_key(config, key)),
                "What it does": SETTING_HELP.get(key, "")}.get(column)
    return value


def _option(value: object) -> tuple[str, str]:
    return (str(value), "") if str(value) else (NO_VALUE, "dim")


def _shown(config: Config, key: str, value: object) -> Text:
    """A value as the page shows it: a switch, one of a set (between the arrows that step through it), or text."""
    if SETTABLE_KEYS[key] is bool:
        return Text("[x] on ", style="green") if value else Text("[ ] off", style="dim")
    if key_choices(config, key):
        return Text.assemble(("‹ ", "dim"), _option(value), (" ›", "dim"))
    return Text(str(value)) if str(value) else Text("(empty)", style="dim")


class ConfigApp(PageApp):
    CSS_PATH = "config_page.tcss"
    TITLE = "supermanager config"
    PAGE = CONFIG_WINDOW
    BINDINGS = [
        Binding("enter,space", "edit", "Toggle / edit"),
        # priority: tab and shift+tab move between the tabs here, not between widgets (Textual's own default)
        Binding("tab", "next_section", "Section", priority=True),
        Binding("shift+tab", "prev_section", "Previous section", show=False, priority=True),
        Binding("q", "detach", "Leave"),
        Binding("question_mark", "help", "Help", show=False),
    ]

    def __init__(self, paths: ProjectPaths):
        super().__init__()
        self.paths = paths
        self.config = load_config(paths.config)
        self.client = DaemonClient(paths.socket)
        self.sections = _sections(list(SETTABLE_KEYS))
        self.section = self.sections[0]
        self.selected: str | None = None
        self.editing: str | None = None
        self.seen = self._stamp()

    @property
    def tmux_session(self) -> str:
        return self.config.tmux_session

    def compose(self) -> ComposeResult:
        yield Tabs(*(Tab(name, id=name) for name in self.sections), id="sections")
        yield Static("", id="about")
        yield PageTable(id="settings")
        yield Input(id="editor", placeholder="new value, enter saves, esc cancels")
        yield Static("", id="status")
        yield SearchBar()
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#editor", Input).display = False
        self._render()
        self.set_interval(WATCH_EVERY, self._follow_file)

    # --------------------------------------------------------------- the file
    def _stamp(self) -> tuple:
        return config_stamp(self.paths.config)

    def _follow_file(self) -> None:
        """The manager, `supermanager config set` and your own editor write the same file: show what it says."""
        stamp = self._stamp()
        if stamp == self.seen or self.editing:
            return
        self.seen = stamp
        self.config = load_config(self.paths.config)
        self._render()

    # -------------------------------------------------------------- sections
    @on(Tabs.TabActivated)
    def _section_chosen(self, event: Tabs.TabActivated) -> None:
        """A tab holds one section of config.toml; the keys stay with the table, so it takes focus back."""
        self.section = str(event.tab.id or self.section)
        self._render()
        self.query_one(DataTable).focus()

    def _step_section(self, step: int) -> None:
        tabs = self.query_one("#sections", Tabs)
        tabs.active = self.sections[(self.sections.index(self.section) + step) % len(self.sections)]

    def action_next_section(self) -> None:
        self._step_section(1)

    def action_prev_section(self) -> None:
        self._step_section(-1)

    def rerender(self) -> None:
        self._render()

    def _render(self) -> None:
        table = self.query_one(DataTable)
        table.clear(columns=True)
        keys = [k for k in SETTABLE_KEYS if self.matches(k, str(get_key(self.config, k)), SETTING_HELP.get(k, ""))]
        # A search or a sort is about everything at once, so it steps out of the tabs and shows the lot, by section.
        across = bool(self.search_text) or bool(self.sort)
        if not across:
            keys = [k for k in keys if k.startswith(f"{self.section}.")]
        self.query_one("#about", Static).update(
            Text(SEARCHING_ABOUT if across else SECTION_ABOUT.get(self.section, ""), style="dim"))
        self.add_columns(table, *COLUMNS, content={
            "Setting": [k.split(".", 1)[1] for k in keys],
            "Value": [_shown(self.config, k, get_key(self.config, k)) for k in keys],
        })
        width = self.flex_width
        overridden = local_keys(self.paths.config)

        def row(key: str) -> None:
            help_text = SETTING_HELP.get(key, "")
            if options := key_choices(self.config, key):
                help_text += " One of: " + " · ".join(_option(o)[0] for o in options) + "."
            if forced := override_note(self.config, key):
                help_text = f"[{forced}] {help_text}"
            if key in overridden:
                help_text = f"[from config.local.toml] {help_text}"
            table.add_row(key.split(".", 1)[1], _shown(self.config, key, get_key(self.config, key)),
                          wrap(help_text, width, "dim"), key=key, height=None)

        if self.sort:   # sorted: one list, the sections would only get in the way
            for key in self.sorted_rows(keys, _sort_value(self.config)):
                row(key)
        elif across:    # searched: every section, each behind its own heading
            for section in _sections(keys):
                table.add_row(Text(section, style="bold reverse"), "",
                              Text(SECTION_ABOUT.get(section, ""), style="bold"), key=GROUP_PREFIX + section)
                for key in [k for k in keys if k.startswith(f"{section}.")]:
                    row(key)
        else:
            for key in keys:
                row(key)
        rows = [str(r.key.value) for r in table.ordered_rows]
        table.move_to_task(rows.index(self.selected) if self.selected in rows else 0)   # never on a heading

    # ------------------------------------------------------------------ edit
    @on(DataTable.RowHighlighted)
    def _row(self, event: DataTable.RowHighlighted) -> None:
        key = str(event.row_key.value or "") if event.row_key else ""
        if key and not key.startswith(GROUP_PREFIX):
            self.selected = key

    @on(DataTable.RowSelected)
    def _row_chosen(self, event: DataTable.RowSelected) -> None:
        self.action_edit()

    # ------------------------------------------------------------ set values
    def _step_value(self, step: int) -> bool:
        """← → on a setting whose values are a set: take the next one. False when this is not such a setting,
        and the arrow goes to the next page instead."""
        key = self.selected
        options = key_choices(self.config, key) if key and not self.editing else ()
        if not options:
            return False
        current = str(get_key(self.config, key))
        at = options.index(current) if current in options else 0
        self._save(key, options[(at + step) % len(options)])
        return True

    def action_prev_page(self) -> None:
        if not self._step_value(-1):
            super().action_prev_page()

    def action_next_page(self) -> None:
        if not self._step_value(1):
            super().action_next_page()

    def action_edit(self) -> None:
        key = self.selected
        if not key or key not in SETTABLE_KEYS or self.editing:
            return
        if SETTABLE_KEYS[key] is bool:
            self._save(key, str(not get_key(self.config, key)))
            return
        if self._step_value(1):   # a set of values: enter takes the next one, like a switch flips
            return
        self.editing = key
        editor = self.query_one("#editor", Input)
        editor.value = str(get_key(self.config, key))
        editor.type = ("integer" if SETTABLE_KEYS[key] is int
                       else "number" if SETTABLE_KEYS[key] is float else "text")
        editor.display = True
        editor.focus()
        self._status(f"[b]{key}[/b]: type the new value")

    @on(Input.Submitted, "#editor")
    def _typed(self, event: Input.Submitted) -> None:
        key, value = self.editing, event.value.strip()
        self.action_cancel_edit()
        if key:
            self._save(key, value)

    def action_help(self) -> None:
        self.push_screen(HelpScreen(f"{self.config.project_name} · the config page", HELP_SECTIONS, HELP_NOTE))

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
        self.seen = self._stamp()
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
