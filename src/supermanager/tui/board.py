"""The board view of the backlog: one column per status (or per label, or per any field), one card per task.

`v` on the tasks page switches between the table and this; `g` picks what the columns are. Arrows move the
selection, shift+arrows move the task itself — to another column (which sets that field, or moves the task
through its status) or up and down inside one. The mouse does the same by dragging a card: while you hold it,
the column you are over lights up and a line shows the gap the card falls into.

Both ways end in the same message, `Board.Drop`: this column, in that gap. The page turns that into a status
change (or a field) and a spot in the backlog. Cards sit in the backlog's own order here, so one you move
stays where you put it.

Open this file to change how a card looks or which moves a column allows.
"""

from __future__ import annotations

from dataclasses import dataclass

from rich.text import Text
from textual import on
from textual.binding import Binding
from textual.containers import Horizontal, VerticalScroll
from textual.events import Click, MouseDown, MouseMove, MouseUp
from textual.geometry import Offset
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
# A list is read top down, so it starts with the work that is on — and with whatever is waiting for you — and
# keeps the backlog for the end. (The board keeps the flow above: on a board you drag left to right.)
TABLE_STATUS_ORDER = (TaskStatus.BLOCKED, TaskStatus.PLANNING, TaskStatus.WORKING, TaskStatus.QUEUED,
                      TaskStatus.INTERRUPTED, TaskStatus.BACKLOG, TaskStatus.DONE, TaskStatus.CANCELLED)
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


def status_grouping(tasks: list, order: tuple = STATUS_ORDER) -> Grouping:
    """The statuses as groups: the flow always, plus the side exits that actually hold a task.

    `order` is the board's flow by default; the table passes TABLE_STATUS_ORDER, and drops the empty ones."""
    here = {str(t.status) for t in tasks}
    values = [str(s) for i, s in enumerate(order) if i < ALWAYS_SHOWN or str(s) in here]
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
    """One task. Click it to select it, double-click to open its file in your editor, hold and move to drag
    it somewhere else.

    While the button is down the card holds the mouse (`capture_mouse`), so the moves still reach it once the
    pointer is over another column. It only reports where the pointer is; the board works out where that lands."""

    ALLOW_SELECT = False   # holding and moving drags the card; it does not sweep a text selection over it

    class Selected(Message):
        def __init__(self, task_id: str) -> None:
            super().__init__()
            self.task_id = task_id

    class Opened(Message):
        def __init__(self, task_id: str) -> None:
            super().__init__()
            self.task_id = task_id

    class Picked(Message):
        """The card is held: the mouse went down on it. Sent then and not on the first move, so the board
        freezes before anything can redraw it — a rebuild here would pull the card out of your hand."""
        def __init__(self, task_id: str) -> None:
            super().__init__()
            self.task_id = task_id

    class Carried(Message):
        def __init__(self, task_id: str, at: Offset) -> None:
            super().__init__()
            self.task_id = task_id
            self.at = at   # where the pointer is, in screen cells

    class Dropped(Message):
        """The button came up. `moved` is False for a plain click, which the click handler deals with."""
        def __init__(self, task_id: str, at: Offset, moved: bool) -> None:
            super().__init__()
            self.task_id = task_id
            self.at = at
            self.moved = moved

    def __init__(self, task_id: str, body: Text, selected: bool) -> None:
        super().__init__(body, classes="card" + (" selected" if selected else ""))
        self.task_id = task_id
        self._held: Offset | None = None   # where the button went down, or None when it is up
        self._moved = False                # it moved while held: a drag, so the click that follows is not one

    async def _on_mouse_down(self, event: MouseDown) -> None:
        if event.button != 1:   # only the left button carries a card
            return
        self._held, self._moved = event.screen_offset, False
        self.capture_mouse()
        self.post_message(self.Picked(self.task_id))
        event.stop()

    async def _on_mouse_move(self, event: MouseMove) -> None:
        if self._held is None:
            return
        event.stop()
        self._moved = self._moved or event.screen_offset != self._held
        if self._moved:
            self.post_message(self.Carried(self.task_id, event.screen_offset))

    async def _on_mouse_up(self, event: MouseUp) -> None:
        if self._held is None:
            return
        self._held = None
        self.release_mouse()
        event.stop()
        self.post_message(self.Dropped(self.task_id, event.screen_offset, self._moved))

    async def _on_click(self, event: Click) -> None:
        event.stop()
        if self._moved:   # the pointer travelled: that was a drag, and the drop already said what to do
            self._moved = False
            return
        self.post_message(self.Opened(self.task_id) if event.chain > 1 else self.Selected(self.task_id))


class BoardColumn(VerticalScroll):
    def __init__(self, value: str, count: int) -> None:
        super().__init__(classes="board-column")
        self.value = value
        self.border_title = f"{value}  {count}" if count else value

    def cards(self) -> list[Card]:
        return list(self.query(Card))


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
    /* While a card is being dragged: the card itself fades, the column under the pointer lights up, and the
       gap it would fall into is drawn as a bright edge on the card above or below it. */
    Board .card.dragged { opacity: 55%; }
    Board .card.drop-above { border-top: heavy $success; }
    Board .card.drop-below { border-bottom: heavy $success; }
    Board .board-column.drop-target { border: round $success; border-title-color: $success; }
    /* A column only an agent can put a task in says so before you let go, and says why after. */
    Board .board-column.drop-target.locked { border: round $warning; border-title-color: $warning; }
    Board .board-column.locked .card.drop-above { border-top: heavy $warning; }
    Board .board-column.locked .card.drop-below { border-bottom: heavy $warning; }
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

    class Drop(Message):
        """Where a card landed, from a drag or from shift+↑↓: this column, in this gap.

        The gap is named by the cards around it — `before` is the one it goes on top of, `after` the one it
        goes under — so the page can put the task there in the backlog without counting rows. A card let go at
        the foot of a column only has an `after`; one on an empty column has neither. `value` and `was` are the
        columns it lands in and came from, the same one when it only changed place."""
        def __init__(self, task_id: str, value: str, was: str,
                     before: str | None = None, after: str | None = None) -> None:
            super().__init__()
            self.task_id = task_id
            self.value = value
            self.was = was
            self.before = before
            self.after = after

    class Select(Message):
        def __init__(self, task_id: str) -> None:
            super().__init__()
            self.task_id = task_id

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self.grouping = Grouping("status", "status", [])
        self.layout_map: dict[str, list[str]] = {}   # column value -> task ids, as drawn
        self.locked: set[str] = set()                # columns a card cannot be dropped into; the page says which
        self.dragged: str | None = None              # the task on the end of the mouse, while one is
        # where it would land: column value, the card it goes above, the card it goes under
        self._drop: tuple[str, str | None, str | None] | None = None
        self._scroll: dict[str, float] = {}          # how far each column was scrolled, kept across redraws

    @property
    def dragging(self) -> bool:
        """The page asks before redrawing: a rebuild mid-drag would pull the card out from under the mouse.

        If the mouse were ever let go without the card hearing about it, the board would hold still for good,
        so the app's own capture is what settles it."""
        if self.dragged and self.app.mouse_captured is None:
            self.dragged = None
        return self.dragged is not None

    # ------------------------------------------------------------------ draw
    def show(self, grouping: Grouping, cards: dict[str, Text], selected: str | None) -> None:
        """cards: task id -> what to print. The page builds the text; this only arranges it.

        Every redraw builds the columns again, so each one's scroll is put back afterwards: without that a
        long column would jump to the top every time an agent reports in."""
        self.grouping = grouping
        self._scroll = {c.value: c.scroll_offset.y for c in self.query(BoardColumn)}
        self.remove_children()
        for value in grouping.values:
            ids = self.layout_map.get(value, [])
            column = BoardColumn(value, len(ids))
            column.set_class(value in self.locked, "locked")
            self.mount(column)
            for task_id in ids:
                column.mount(Card(task_id, cards[task_id], task_id == selected))
            if not ids:
                column.mount(Static("nothing here", classes="board-empty"))
        self.call_after_refresh(self._restore_scroll)

    def _restore_scroll(self) -> None:
        for column in self.query(BoardColumn):
            if self._scroll.get(column.value):
                column.scroll_to(y=self._scroll[column.value], animate=False)

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
        """shift+↑ / shift+↓: one place up or down inside the column, past the card that is actually next to
        it there — which in the backlog as a whole can be many tasks away."""
        here = self._where(self.selected)
        if not here:
            return
        value, index = here
        ids = self.layout_map[value]
        target = index + delta
        if not 0 <= target < len(ids):
            return
        if delta < 0:   # over the card above it
            self.post_message(self.Drop(self.selected, value, value, before=ids[target]))
        else:           # under the card below it
            after = ids[target]
            self.post_message(self.Drop(self.selected, value, value,
                                        before=ids[target + 1] if target + 1 < len(ids) else None, after=after))

    @on(Card.Selected)
    def _card_selected(self, event: Card.Selected) -> None:
        event.stop()
        self.post_message(self.Select(event.task_id))

    # ------------------------------------------------------------- the mouse
    def _card_of(self, task_id: str) -> Card | None:
        return next((c for c in self.query(Card) if c.task_id == task_id), None)

    def _under(self, at: Offset) -> tuple[str, str | None, str | None] | None:
        """Where the pointer is, as a landing spot: the column, and the gap named by the cards around it.

        A card is split down the middle — above that line the drop goes before it, below it goes after — so
        every gap between two cards, and the space under the last one, can be aimed at."""
        for column in self.query(BoardColumn):
            if not column.region.contains(*at):
                continue
            previous: str | None = None
            for card in column.cards():
                if at.y < card.region.y + card.region.height / 2:
                    return column.value, card.task_id, previous
                previous = card.task_id
            return column.value, None, previous
        return None

    def _hint(self, target: tuple[str, str | None, str | None] | None) -> None:
        """Draw the landing spot: the column lights up, and the gap shows as a bright edge on its card."""
        value, before, after = target or (None, None, None)
        for column in self.query(BoardColumn):
            here = column.value == value
            column.set_class(here, "drop-target")
            for card in column.cards():
                card.set_class(here and card.task_id == before, "drop-above")
                card.set_class(here and before is None and card.task_id == after, "drop-below")

    def _follow(self, at: Offset) -> None:
        """Dragging to an edge scrolls: down a column that is longer than the screen, or sideways to a column
        that is off it."""
        for column in self.query(BoardColumn):
            if column.region.contains(*at):
                if at.y <= column.region.y + 1:
                    column.scroll_up(animate=False)
                elif at.y >= column.region.bottom - 2:
                    column.scroll_down(animate=False)
        if at.x <= self.region.x + 1:
            self.scroll_left(animate=False)
        elif at.x >= self.region.right - 2:
            self.scroll_right(animate=False)

    @on(Card.Picked)
    def _card_picked(self, event: Card.Picked) -> None:
        event.stop()
        self.dragged = event.task_id   # from here the page leaves the board alone until the button comes up

    @on(Card.Carried)
    def _card_carried(self, event: Card.Carried) -> None:
        event.stop()
        if self.dragged != event.task_id:
            return
        card = self._card_of(event.task_id)
        if card:
            card.add_class("dragged")   # only once it really moves, so a plain click does not blink
        self._follow(event.at)
        self._drop = self._under(event.at)
        self._hint(self._drop)

    @on(Card.Dropped)
    def _card_dropped(self, event: Card.Dropped) -> None:
        event.stop()
        target, self._drop, self.dragged = self._drop, None, None
        self._hint(None)
        card = self._card_of(event.task_id)
        if card:
            card.remove_class("dragged")
        was = self._where(event.task_id)
        if not event.moved or not target or not was:
            return   # a plain click, or let go over nothing: the card stays where it was
        value, before, after = target
        self.post_message(self.Drop(event.task_id, value, was[0], before, after))
