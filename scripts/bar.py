"""The strip tmux draws under every page: the project, the pages, and whatever rings for you on the right.

Both screenshot scripts put it in their pictures — on screen it is part of what you are looking at, so a
picture without it would not be the app.
"""
from __future__ import annotations

from textual.containers import Horizontal
from textual.widgets import Footer, Static

TABS = ("manager", "tasks", "agents", "config")


class Bar(Horizontal):
    DEFAULT_CSS = """
    Bar { dock: bottom; height: 1; background: #303030; color: #bcbcbc; }
    Bar > .left { width: 1fr; padding: 0 1; }
    Bar > .right { width: auto; padding: 0 1; }
    """

    def __init__(self, left: str, right: str) -> None:
        super().__init__(Static(left, classes="left"), Static(right, classes="right"))


def bar(project: str, active: str, counts: dict[str, int], ringing: str = "") -> Bar:
    def tab(name: str) -> str:
        label = f"{name} ({counts[name]})" if counts.get(name) else name
        return f"[black on #5fd7ff] {label} [/]" if name == active else f" {label} "

    left = f"[b #5fd7ff] {project} [/][#585858]│[/]" + "".join(tab(name) for name in TABS)
    # An agent that rings for you sits on the right, where tmux puts it, next to the key that cycles the pages.
    bell = f"[bold #ffaf00] 🔔 {ringing} [/]  " if ringing else ""
    return Bar(left, f"{bell}[#8a8a8a]ctrl+a / ← → pages[/]")


async def with_bar(app, project: str, active: str, counts: dict[str, int], ringing: str = "") -> None:
    """Mount the bar on a page and nudge that page's own footer up by a row, the way the terminal does."""
    for footer in app.query(Footer):
        footer.styles.offset = (0, -1)
    await app.mount(bar(project, active, counts, ringing))
