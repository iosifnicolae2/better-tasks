"""Turn a live tmux pane into an SVG for the README: `python scripts/capture.py <window> <name> [lines]`.

The pages are drawn by scripts/screenshots.py; this one is for the sessions themselves (the manager chat, an
agent presenting its plan), which only exist while something is really running.
"""
import subprocess
import sys
from pathlib import Path

from rich.console import Console
from rich.text import Text

OUT = Path(__file__).resolve().parents[1] / "docs" / "screenshots"
SESSION = "sm-acme-api"


def pane(window: str, lines: int) -> str:
    text = subprocess.run(["tmux", "-L", "supermanager", "capture-pane", "-e", "-p", "-t", f"={SESSION}:={window}"],
                          capture_output=True, text=True, check=True).stdout
    kept = [line for line in text.splitlines() if line.strip()]
    return "\n".join(kept[-lines:])


def main() -> None:
    window, name, lines = sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 20
    body = Text.from_ansi(pane(window, lines))
    console = Console(record=True, width=max(len(l) for l in body.plain.splitlines()) + 2, file=open("/dev/null", "w"))
    console.print(body)
    OUT.mkdir(parents=True, exist_ok=True)
    console.save_svg(str(OUT / f"{name}.svg"), title=f"{SESSION} · {window}")
    print(f"{name}.svg")


if __name__ == "__main__":
    main()
