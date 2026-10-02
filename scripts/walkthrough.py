"""The session pictures in the README's walkthrough, redrawn from what a real run printed.

The lines below were captured (with scripts/capture.py) from a run on a small demo project on 2026-09-13: a CSV
importer that dropped rows when the file started with a BOM. Keeping them here means `make screenshots` can
redraw every picture in the README at the same width, under the same bar, without a live session — and
scripts/capture.py is still what you use to take new ones from a workspace you are running.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from rich.text import Text

sys.path.insert(0, str(Path(__file__).resolve().parent))
from capture import OUT, render

DIM = "#9aa0a6"
AMBER = "#fd971f"

# The manager chat: you say what you want, it writes the task and puts a planner on it.
MANAGER = [
    ("❯ The CSV import drops rows when the file starts with a BOM. Fix it and add a test.", "bold"),
    ("", ""),
    ("  Called supermanager 2 times", DIM),
    ("⏺ Task T-001 created, and a planner has started on it. It is reading the CSV reader now; it will ask", ""),
    ("  you anything it cannot work out from the code, then come back with a plan to start.", ""),
    ("", ""),
    ("✻ Cogitated for 10s · done 2:07 AM", DIM),
    ("──────────────────────────────────────────────────────────────────────────── acme-api-manager ─", DIM),
    ("❯ ", ""),
    ("  /remote-control is active · continue here, on your phone, or at claude.ai/code", DIM),
]

# The planner on T-001: it has read the code, written the plan onto the task, and asks whether to start.
PLAN = [
    ("  Called supermanager · update_plan", DIM),
    ("⏺ What I found", "bold"),
    ("  read_rows opens the file with no encoding, so a BOM lands in the first", ""),
    ("  column name and every lookup of it misses. Nothing else reads headers.", ""),
    ("  The importer has no tests at all today.", ""),
    ("", ""),
    ("  Plan", "bold"),
    ("  1. Add tests/test_import_bom.py: same CSV with and without a BOM.", ""),
    ("  2. Open with encoding=\"utf-8-sig\" in importer.read_rows.", ""),
    ("  3. Run python3 -m pytest -q, then commit on sm/T-001.", ""),
    ("", ""),
    ("  Touches", "bold"),
    ("  importer.py · tests/test_import_bom.py", ""),
    ("", ""),
    ("  Assumed", "bold"),
    ("  Only the importer is in scope; the export reads the same way and I left", ""),
    ("  it alone.", ""),
    ("", ""),
    ("╭─ Start the work on T-001? ───────────────────────────────────────────────────────────────────╮", AMBER),
    ("│  ❯ 1. Start it           an agent takes this plan and builds it in its own copy of the repo  │", ""),
    ("│    2. Change the plan    say what to do differently and I will rewrite it                    │", ""),
    ("│    3. Leave it for now   the plan stays on the task; start it whenever you like              │", ""),
    ("╰──────────────────────────────────────────────────────────────────────────────────────────────╯", AMBER),
    ("──────────────────────────────────────────────────────────────────── acme-api-T-001-plan ─", DIM),
    ("❯ ", ""),
    ("  claude opus · planning T-001 · answer here, or on your phone", DIM),
]

# The same agent once it is working: it stops for the one thing only you can decide.
INPUT = [
    ("⏺ Update(importer.py)", ""),
    ("  ⎿ 1 addition, 1 removal", DIM),
    ("⏺ Write(tests/test_import_bom.py)", ""),
    ("  ⎿ 38 lines", DIM),
    ("⏺ Bash(python3 -m pytest -q)", ""),
    ("  ⎿ 2 passed in 0.41s", DIM),
    ("", ""),
    ("╭─ Two other readers open the file the same way ───────────────────────────────────────────────╮", AMBER),
    ("│  ❯ 1. Keep it to the importer   the weekly export and the CLI stay as they are               │", ""),
    ("│    2. Switch all three          one change, three readers, one test each                     │", ""),
    ("╰──────────────────────────────────────────────────────────────────────────────────────────────╯", AMBER),
    ("──────────────────────────────────────────────────────────────────────────── acme-api-T-001 ─", DIM),
    ("❯ ", ""),
    ("  claude opus · sm/T-001 · answer here, or on your phone", DIM),
]

PICTURES = (
    ("walkthrough-manager", MANAGER, "manager", ""),
    ("walkthrough-plan", PLAN, "agents", ""),          # inside an agent, the agents tab is the one lit
    ("walkthrough-input", INPUT, "agents", ""),
)


def body(rows: list[tuple[str, str]]) -> Text:
    out = Text()
    for text, style in rows:
        out.append(text + "\n", style=style or None)
    return out


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, rows, active, ringing in PICTURES:
        await render(body(rows), OUT / f"{name}.svg", active=active, ringing=ringing)
        print(f"{name}.svg")


if __name__ == "__main__":
    asyncio.run(main())
