"""The board view of the backlog: one column per status (or per label, or per any field), one card per task.

`v` on the tasks page switches between the table and this; `g` picks what the columns are. Arrows move the
selection, shift+arrows move the task itself — to another column (which sets that field, or moves the task
through its status) or up and down inside one.

Open this file to change how a card looks or which moves a column allows.
"""

from __future__ import annotations

from dataclasses import dataclass

from rich.text import Text
from textual import on
from textual.binding import Binding
from textual.containers import Horizontal, VerticalScroll
from textual.events import Click
from textual.message import Message
from textual.widgets import Static

from ..models import TaskStatus

CARD_WIDTH = 26   # the text inside a card's border
LABEL_STYLES = ("cyan", "magenta", "green", "yellow", "blue", "bright_magenta", "bright_cyan")
# The flow, left to right. The first four are always shown (an empty column is where you drop work);
# the rest only when they hold something.
STATUS_ORDER = (TaskStatus.BACKLOG, TaskStatus.QUEUED, TaskStatus.PLANNING, TaskStatus.WORKING,
                TaskStatus.BLOCKED, TaskStatus.INTERRUPTED, TaskStatus.DONE, TaskStatus.CANCELLED)
ALWAYS_SHOWN = 5
NO_VALUE = "—"   # the column for tasks that have nothing in the field the board groups by


def label_chips(labels: list[str]) -> Text:
    """Labels as little coloured chips; the same label keeps its colour everywhere."""
    out = Text()
    for label in labels or []:
        style = LABEL_STYLES[sum(map(ord, label)) % len(LABEL_STYLES)]
        out.append(f" {label} ", style=f"reverse {style}")
        out.append(" ")
    return out


@dataclass
class Grouping:
    """What the columns are: a status board, or one column per value of a task field."""
    key: str            # "status" or a field name
    title: str
    values: list[str]   # the columns, in order

    def of(self, task) -> list[str]:
        """Which columns a task belongs in (a list field can put it in several)."""
        if self.key == "status":
            return [str(task.status)]
        value = task.fields.get(self.key)
        if isinstance(value, list):
            return [str(v) for v in value] or [NO_VALUE]
        return [str(value)] if value else [NO_VALUE]


def status_grouping(tasks: list) -> Grouping:
    """The statuses as columns: the flow always, plus the side exits that actually hold a task."""
    here = {str(t.status) for t in tasks}
    values = [str(s) for i, s in enumerate(STATUS_ORDER) if i < ALWAYS_SHOWN or str(s) in here]
    return Grouping("status", "status", values)


def field_grouping(field, tasks) -> Grouping:
    """Columns from what the tasks actually carry, so a board never shows an empty sea of values."""
    seen: list[str] = []
    for task in tasks:
        value = task.fields.get(field.name)
        for one in (value if isinstance(value, list) else [value]):
            text = str(one) if one else NO_VALUE
            if text not in seen:
                seen.append(text)
    seen.sort(key=lambda v: (v == NO_VALUE, v))
    return Grouping(field.name, field.column or field.name, seen or [NO_VALUE])


class Card(Static):
    """One task. Click it to select it; the selected one has a bright border."""

    class Selected(Message):
        def __init__(self, task_id: str) -> None:
            super().__init__()
            self.task_id = task_id

    class Opened(Message):
        def __init__(self, task_id: str) -> None:
            super().__init__()
            self.task_id = task_id

    def __init__(self, task_id: str, body: Text, selected: bool) -> None:
        super().__init__(body, classes="card" + (" selected" if selected else ""))
        self.task_id = task_id

    async def _on_click(self, event: Click) -> None:
        self.post_message(self.Opened(self.task_id) if event.chain > 1 else self.Selected(self.task_id))
        event.stop()


class BoardColumn(VerticalScroll):
    def __init__(self, value: str, count: int) -> None:
        super().__init__(classes="board-column")
        self.value = value
        self.border_title = f"{value}  {count}" if count else value


class Board(Horizontal):
    """The columns side by side. The page tells it what to draw; it tells the page what the user wants moved."""

    DEFAULT_CSS = """
    Board { height: 1fr; overflow-x: auto; }
    Board .board-column {
        width: 32; height: 1fr; margin: 0 1 0 0; padding: 0 1;
        border: round $panel; border-title-color: $text-muted; border-title-align: left;
    }
    Board .card {
        width: 100%; height: auto; margin: 0 0 1 0; padding: 0 1;
        border: round $panel-lighten-2; background: $panel;
    }
    Board .card.selected { border: round $accent; background: $boost; }
    Board .board-empty { color: $text-muted; padding: 1 2; }
    """
    can_focus = True

    BINDINGS = [
        Binding("up", "move_cursor(-1)", "Up", show=False),
        Binding("down", "move_cursor(1)", "Down", show=False),
        Binding("left", "move_column(-1)", "Left", show=False),
        Binding("right", "move_column(1)", "Right", show=False),
        Binding("shift+left", "move_task(-1)", "◀ move", show=False),
        Binding("shift+right", "move_task(1)", "move ▶", show=False),
        Binding("shift+up", "reorder(-1)", "move up", show=False),
        Binding("shift+down", "reorder(1)", "move down", show=False),
    ]

    class Move(Message):
        """Move this task from one column to another (the page decides what that means)."""
        def __init__(self, task_id: str, value: str, was: str) -> None:
            super().__init__()
            self.task_id = task_id
            self.value = value
            self.was = was

    class Reorder(Message):
        def __init__(self, task_id: str, delta: int) -> None:
            super().__init__()
            self.task_id = task_id
            self.delta = delta

    class Select(Message):
        def __init__(self, task_id: str) -> None:
            super().__init__()
            self.task_id = task_id

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self.grouping = Grouping("status", "status", [])
        self.layout_map: dict[str, list[str]] = {}   # column value -> task ids, as drawn

    # ------------------------------------------------------------------ draw
    def show(self, grouping: Grouping, cards: dict[str, Text], selected: str | None) -> None:
        """cards: task id -> what to print. The page builds the text; this only arranges it."""
        self.grouping = grouping
        self.remove_children()
        for value in grouping.values:
            ids = self.layout_map.get(value, [])
            column = BoardColumn(value, len(ids))
            self.mount(column)
            for task_id in ids:
                column.mount(Card(task_id, cards[task_id], task_id == selected))
            if not ids:
                column.mount(Static("nothing here", classes="board-empty"))

    def plan(self, grouping: Grouping, tasks: list) -> dict[str, list[str]]:
        """Which task goes in which column, in the order the page gave them."""
        self.layout_map = {value: [] for value in grouping.values}
        for task in tasks:
            for value in grouping.of(task):
                self.layout_map.setdefault(value, []).append(task.id)
        return self.layout_map

    # ----------------------------------------------------------------- moves
    def _where(self, task_id: str | None) -> tuple[str, int] | None:
        for value, ids in self.layout_map.items():
            if task_id in ids:
                return value, ids.index(task_id)
        return None

    @property
    def selected(self) -> str | None:
        card = next((c for c in self.query(Card) if c.has_class("selected")), None)
        return card.task_id if card else None

    def action_move_cursor(self, delta: int) -> None:
        here = self._where(self.selected)
        if not here:
            return
        ids = self.layout_map[here[0]]
        self.post_message(self.Select(ids[max(0, min(len(ids) - 1, here[1] + delta))]))

    def action_move_column(self, delta: int) -> None:
        """Selection to the neighbouring column, landing on the card nearest the one you were on."""
        here = self._where(self.selected)
        values = [v for v in self.layout_map if self.layout_map[v]]
        if not here or here[0] not in values:
            first = next((ids[0] for ids in self.layout_map.values() if ids), None)
            if first:
                self.post_message(self.Select(first))
            return
        index = values.index(here[0]) + delta
        if 0 <= index < len(values):
            ids = self.layout_map[values[index]]
            self.post_message(self.Select(ids[min(here[1], len(ids) - 1)]))

    def action_move_task(self, delta: int) -> None:
        here = self._where(self.selected)
        if not here:
            return
        values = self.grouping.values
        index = values.index(here[0]) + delta if here[0] in values else 0
        if 0 <= index < len(values):
            self.post_message(self.Move(self.selected, values[index], here[0]))

    def action_reorder(self, delta: int) -> None:
        if self.selected:
            self.post_message(self.Reorder(self.selected, delta))

    @on(Card.Selected)
    def _card_selected(self, event: Card.Selected) -> None:
        event.stop()
        self.post_message(self.Select(event.task_id))
