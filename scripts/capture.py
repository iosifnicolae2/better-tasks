"""Turn a live tmux pane into an SVG for the README: `python scripts/capture.py <window> <name> [lines]`.

It renders through Textual, at the same width as the page screenshots and under the same bar, so a picture of a
session and a picture of a page are the same workspace.
"""
from __future__ import annotations

import asyncio
import subprocess
import sys
from pathlib import Path

from rich.text import Text
from textual.app import App, ComposeResult
from textual.widgets import Static

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bar import with_bar
from svg_tools import strip_chrome

OUT = Path(__file__).resolve().parents[1] / "docs" / "screenshots"
SESSION = "sm-acme-api"
WIDTH = 150   # the width every screenshot is drawn at


def pane(window: str, lines: int) -> str:
    text = subprocess.run(["tmux", "-L", "supermanager", "capture-pane", "-e", "-p", "-t", f"={SESSION}:={window}"],
                          capture_output=True, text=True, check=True).stdout
    kept = [line for line in text.splitlines() if line.strip()]
    return "\n".join(kept[-lines:])


PROJECT = "acme-api"
COUNTS = {"tasks": 5, "agents": 3}


class Screen(App):
    """One widget: the captured text, on the terminal's own background."""
    CSS = "Screen { background: $surface; } Static { padding: 0 1; }"

    def __init__(self, body: Text) -> None:
        super().__init__()
        self.body = body

    def compose(self) -> ComposeResult:
        yield Static(self.body)


async def render(body: Text, path: Path, active: str = "manager", ringing: str = "") -> None:
    """The pane with the workspace bar under it — what you actually see on screen."""
    app = Screen(body)
    async with app.run_test(size=(WIDTH, len(body.plain.splitlines()) + 1)) as pilot:
        await pilot.pause()
        await with_bar(app, PROJECT, active, COUNTS, ringing)
        for _ in range(3):
            await pilot.pause()
        path.write_text(strip_chrome(app.export_screenshot()))


def main() -> None:
    window, name, lines = sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 20
    OUT.mkdir(parents=True, exist_ok=True)
    asyncio.run(render(Text.from_ansi(pane(window, lines)), OUT / f"{name}.svg"))
    print(f"{name}.svg")


if __name__ == "__main__":
    main()
