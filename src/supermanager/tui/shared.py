"""Bits the pages share: ctrl+c ctrl+c to quit everything, ← → between pages, ctrl+w search, click-to-sort
tables, the title prompt, and opening a task file — in your editor, or in the built-in markdown editor when
yours is missing."""

from __future__ import annotations

import locale
import shutil
import subprocess
import sys
import textwrap
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from rich.text import Text
from textual import events, on
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Vertical
from textual.coordinate import Coordinate
from textual.message import Message
from textual.screen import ModalScreen, Screen
from textual.widgets import DataTable, Input, Static, TextArea

from ..tmux import Tmux, inside_tmux_session


# ------------------------------------------------------------------------------------------ quitting
QUIT_BINDINGS = [
    Binding("ctrl+c", "ctrl_c", "Quit all (press twice)", priority=True, show=False),
    Binding("ctrl+q", "ignore", show=False, priority=True),   # Textual's default quit key: not ours
]
QUIT_WINDOW = 3.0   # seconds between the two ctrl+c presses


class QuitTwice:
    """ctrl+c twice quits everything (manager, agents, tmux). Apps mix this in and implement quit_all().

    Put QUIT_BINDINGS in the app's BINDINGS (Textual only reads BINDINGS from DOM classes).
    """
    _ctrl_c_at: float = 0.0

    def action_ctrl_c(self) -> None:
        now = time.monotonic()
        if now - self._ctrl_c_at < QUIT_WINDOW:
            self.quit_all()
            return
        self._ctrl_c_at = now
        self.notify("ctrl+c again stops everything: manager, agents, tmux. (q leaves them running.)",   # type: ignore[attr-defined]
                    timeout=QUIT_WINDOW)

    def action_ignore(self) -> None:
        pass

    def quit_all(self) -> None:
        raise NotImplementedError


# ------------------------------------------------------------------------------------- pages, search
FLEX = None   # the column that takes the rest of the row (see PageApp.add_columns)
AUTO = -1     # a column as wide as the widest thing in it
AUTO_MAX = 40

PAGE_BINDINGS = [
    Binding("left", "prev_page", "◀ page", show=False),
    Binding("right", "next_page", "page ▶", show=False),
    Binding("ctrl+w", "search", "Search"),
    Binding("escape", "clear_search", "Clear search", show=False),
]


class PageApp(QuitTwice, App):
    """What every page app has: its tmux window name, ← → to the neighbouring pages, ctrl+w search (like nano's
    "where is": type, the rows narrow down as you type; esc clears), and sortable columns (click a title).

    Pages subclass this, set PAGE and tmux_session, and implement rerender()."""
    PAGE = ""
    ENABLE_COMMAND_PALETTE = False
    BINDINGS = [*QUIT_BINDINGS, *PAGE_BINDINGS]

    @property
    def tmux_session(self) -> str:
        raise NotImplementedError

    def rerender(self) -> None:
        raise NotImplementedError

    # -- pages
    def action_prev_page(self) -> None:
        self._go(-1)

    def action_next_page(self) -> None:
        self._go(1)

    def _go(self, step: int) -> None:
        if inside_tmux_session(self.tmux_session):
            Tmux(self.tmux_session).select_page(self.PAGE, step)

    # -- search
    @property
    def search_text(self) -> str:
        """What is typed in the search bar. (Never call this `query`: App.query is Textual's own.)"""
        try:
            return self.query_one(SearchBar).value.strip().lower()   # type: ignore[attr-defined]
        except Exception:
            return ""

    def action_search(self) -> None:
        bar = self.query_one(SearchBar)   # type: ignore[attr-defined]
        bar.display = True
        bar.focus()

    def action_clear_search(self) -> None:
        bar = self.query_one(SearchBar)   # type: ignore[attr-defined]
        if not bar.display and not bar.value:
            return
        bar.value = ""
        bar.display = False
        self.query_one(DataTable).focus()   # type: ignore[attr-defined]
        self.rerender()

    def matches(self, *cells: object) -> bool:
        q = self.search_text
        return not q or any(q in _plain(c).lower() for c in cells)

    @on(Input.Changed, "SearchBar")
    def _search_typed(self) -> None:
        self.rerender()

    @on(Input.Submitted, "SearchBar")
    def _search_done(self) -> None:
        """enter keeps the filter and gives the keys back to the table."""
        self.query_one(DataTable).focus()   # type: ignore[attr-defined]

    # -- sorting
    sort: "Sort | None" = None

    @on(DataTable.HeaderSelected)
    def _header_clicked(self, event: DataTable.HeaderSelected) -> None:
        """A click on a column title cycles: ▲ up, ▼ down, then back to the page's own order."""
        key = str(event.column_key.value)
        if not self.sort or self.sort.key != key:
            self.sort = Sort(key)
        elif not self.sort.reverse:
            self.sort = Sort(key, reverse=True)
        else:
            self.sort = None
        self.rerender()

    flex_width = 40   # what the FLEX column got the last time the columns were built

    def add_columns(self, table: DataTable, *columns: tuple[str, int | None],
                    content: dict[str, list] | None = None) -> list:
        """Build the columns from (name, width) pairs: keyed by name (so a header click knows which one),
        the sorted one marked ▲/▼.

        A width is a number of cells, AUTO (as wide as its widest value — pass the values in `content`), or
        FLEX for the one column that takes whatever is left of the row and wraps inside it. Widths are settled
        here and not per row, so nothing shifts while the page refreshes in place."""
        content = content or {}
        sized = [(name, self._width(name, width, content.get(name, []))) for name, width in columns]
        # Every column costs its width plus the table's padding on each side; what is left over is the flex
        # column's, so the row reaches the right edge instead of stopping short of it.
        overhead = 2 * table.cell_padding * len(sized)
        self.flex_width = max(16, table.size.width - sum(w for _, w in sized if w) - overhead - 1)
        keys = []
        for name, width in sized:
            mark = "" if not self.sort or self.sort.key != name else (" ▼" if self.sort.reverse else " ▲")
            keys.append(table.add_column(Text(name + mark, style="bold"), key=name, width=width or self.flex_width))
        return keys

    @staticmethod
    def _width(name: str, width: int | None, values: list) -> int | None:
        if width != AUTO:
            return width
        longest = max([len(name)] + [len(_plain(v).split("\n")[0]) for v in values])
        return min(longest + 1, AUTO_MAX)

    def sorted_rows(self, rows: list, value: Callable[[object, str], object]) -> list:
        if not self.sort:
            return rows
        return sorted(rows, key=lambda r: _sortable(value(r, self.sort.key)), reverse=self.sort.reverse)


@dataclass
class Sort:
    key: str
    reverse: bool = False


class SearchBar(Input):
    """The ctrl+w search line; hidden until asked for."""
    DEFAULT_CSS = "SearchBar { height: 1; border: none; padding: 0 1; background: $surface; } SearchBar:focus { border: none; }"

    def __init__(self, **kwargs):
        super().__init__(placeholder="search… (enter keeps it, esc clears)", **kwargs)
        self.display = False


def _plain(cell: object) -> str:
    return cell.plain if isinstance(cell, Text) else str(cell)


def _sortable(value: object) -> tuple:
    """Numbers before text, text case-insensitively; None last."""
    if value is None or value == "":
        return (2, "")
    if isinstance(value, (int, float)):
        return (0, value)
    return (1, str(value).lower())


try:   # dates in the format this machine uses, not a hard-coded one
    locale.setlocale(locale.LC_TIME, "")
except locale.Error:
    pass


def local_time(ts: float | None) -> str:
    """A timestamp as this machine writes dates and times (%x %X from the current locale)."""
    if not ts:
        return ""
    return time.strftime("%x %H:%M", time.localtime(ts))


def wrap(text: str, width: int, style: str = "") -> Text:
    """A cell that wraps to `width` columns instead of making the table scroll sideways."""
    return Text("\n".join(textwrap.wrap(text, max(10, width)) or [""]), style=style)


class TitleScreen(ModalScreen[str | None]):
    """Ask for a title only; the task body comes from the template and is edited in your editor."""
    BINDINGS = [Binding("escape", "dismiss", "Cancel")]
    DEFAULT_CSS = """
    TitleScreen { align: center middle; }
    TitleScreen #confirm { width: 70; height: auto; border: thick $primary; background: $surface; padding: 1 2; }
    """

    def __init__(self, heading: str, footnote: str):
        super().__init__()
        self.heading = heading
        self.footnote = footnote

    def compose(self) -> ComposeResult:
        with Vertical(id="confirm"):
            yield Static(f"[b]{self.heading}[/b]   [dim]enter create · esc cancel[/dim]")
            yield Input(placeholder="Short, specific title", id="title")
            yield Static(f"[dim]{self.footnote}[/dim]")

    @on(Input.Submitted, "#title")
    def _submit(self) -> None:
        self.dismiss(self.query_one("#title", Input).value.strip() or None)


GROUP_PREFIX = "\x00group\x00"   # the key of a heading row: never a task id, so nothing can collide with it


class PageTable(DataTable):
    """A row-cursor table for a page: ← → go to the neighbouring pages instead of moving the cell cursor,
    heading rows are stepped over, and a click on one of `action_columns` posts CellClicked."""

    class CellClicked(Message):
        def __init__(self, row_key, column: int):
            super().__init__()
            self.row_key = row_key
            self.column = column

    # The selected row keeps its own colours — a status stays green, a bell stays amber — so only the background
    # tells you where the cursor is. The tint is soft enough that every colour we use still reads on it.
    DEFAULT_CSS = """
    PageTable > .datatable--cursor { background: $primary 18%; }
    PageTable:focus > .datatable--cursor { background: $primary 30%; }
    """

    def __init__(self, *args, action_columns: tuple[int, ...] = (), **kwargs):
        super().__init__(*args, cursor_type="row", zebra_stripes=True,
                         cursor_foreground_priority="renderable", **kwargs)
        self.action_columns = action_columns

    def on_resize(self) -> None:
        self.app.rerender()   # type: ignore[attr-defined]   # the wrapping column follows the table's width

    def _on_heading(self) -> bool:
        row = self.cursor_row
        if not (0 <= row < self.row_count):
            return False
        return str(self.ordered_rows[row].key.value or "").startswith(GROUP_PREFIX)

    def action_cursor_down(self) -> None:
        super().action_cursor_down()
        while self._on_heading() and self.cursor_row < self.row_count - 1:
            super().action_cursor_down()

    def action_cursor_up(self) -> None:
        super().action_cursor_up()
        while self._on_heading() and self.cursor_row > 0:
            super().action_cursor_up()

    def move_to_task(self, row: int) -> None:
        """Put the cursor on a row, stepping off a heading if that is where it lands."""
        self.move_cursor(row=row)
        while self._on_heading() and self.cursor_row < self.row_count - 1:
            super().action_cursor_down()

    def action_cursor_left(self) -> None:
        self.app.action_prev_page()   # type: ignore[attr-defined]

    def action_cursor_right(self) -> None:
        self.app.action_next_page()   # type: ignore[attr-defined]

    async def _on_click(self, event: events.Click) -> None:
        meta = event.style.meta
        row, column = meta.get("row", -1), meta.get("column", -1)
        if row < 0 or column not in self.action_columns:
            await super()._on_click(event)
            return
        self.cursor_coordinate = Coordinate(row, column)
        self.post_message(self.CellClicked(self.ordered_rows[row].key, column))
        event.stop()
        event.prevent_default()   # otherwise DataTable's own _on_click still runs and selects the row


# ------------------------------------------------------------------------------------------- editing
def editor_argv(editor: str, path: Path) -> list[str] | None:
    """How to launch the editor, or None when it is not installed. `idea file` needs the IDE's command-line
    launcher; without it, macOS `open -a` finds the app itself."""
    if shutil.which(editor):
        return [editor, str(path)]
    apps = {"idea": "IntelliJ IDEA", "code": "Visual Studio Code", "pycharm": "PyCharm", "webstorm": "WebStorm"}
    if sys.platform == "darwin" and editor in apps:
        return ["open", "-a", apps[editor], str(path)]
    return None


def open_in_editor(editor: str, path: Path) -> tuple[bool, str]:
    """Open a task file in the user's editor; (False, why) when that editor is not available."""
    editor = editor or "idea"
    argv = editor_argv(editor, path)
    if argv is None:
        return False, f"'{editor}' is not installed"
    try:
        if argv[0] == "open":   # `open -a` returns at once, non-zero when the app is missing
            proc = subprocess.run(argv, capture_output=True, text=True)
            if proc.returncode:
                return False, f"'{editor}' is not installed"
        else:
            subprocess.Popen(argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError as exc:
        return False, f"could not run '{editor}': {exc}"
    return True, f"Opened {path.name} in {editor}. Edits are picked up when the file is saved."


def edit_task(app: App, editor: str, path: Path) -> None:
    """Open the task file in the configured editor, or in the built-in one when that is not available."""
    ok, message = open_in_editor(editor, path)
    if ok:
        app.notify(message)
        return
    app.notify(f"{message}; editing here. Set tasks.editor on the config page to use yours.", timeout=6)
    app.push_screen(EditorScreen(path))


class EditorScreen(Screen[None]):
    """A full-screen markdown editor for one task file. ctrl+s saves, esc closes (twice to drop unsaved changes)."""
    BINDINGS = [Binding("ctrl+s", "save", "Save"), Binding("escape", "close", "Close")]
    DEFAULT_CSS = """
    EditorScreen { layout: vertical; }
    EditorScreen #editor-bar, EditorScreen #editor-status { height: 1; background: $panel; padding: 0 1; }
    EditorScreen TextArea { height: 1fr; border: none; }
    EditorScreen TextArea:focus { border: none; }
    """

    def __init__(self, path: Path):
        super().__init__()
        self.path = path
        self.discard_armed = False

    def compose(self) -> ComposeResult:
        yield Static(f" [b]{self.path.name}[/b]   [dim]ctrl+s save · esc close[/dim]", id="editor-bar")
        text = self.path.read_text() if self.path.exists() else ""
        area = TextArea(text, id="editor-text", soft_wrap=True)
        if "markdown" in area.available_languages:
            area.language = "markdown"
        yield area
        yield Static("", id="editor-status")

    def on_mount(self) -> None:
        self.query_one(TextArea).focus()

    @property
    def dirty(self) -> bool:
        current = self.path.read_text() if self.path.exists() else ""
        return self.query_one(TextArea).text != current

    def action_save(self) -> None:
        self.path.write_text(self.query_one(TextArea).text)
        self.discard_armed = False
        self.query_one("#editor-status", Static).update("[green]saved[/green]")

    def action_close(self) -> None:
        if self.dirty and not self.discard_armed:
            self.discard_armed = True
            self.query_one("#editor-status", Static).update(
                "[yellow]unsaved changes[/yellow]: ctrl+s saves · esc again closes without saving")
            return
        self.dismiss()

    @on(TextArea.Changed)
    def _typed(self) -> None:
        self.discard_armed = False
        self.query_one("#editor-status", Static).update("")
