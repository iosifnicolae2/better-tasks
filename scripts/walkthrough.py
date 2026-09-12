"""The four pictures in the README's walkthrough, redrawn from what a real run printed.

The lines below were captured (with scripts/capture.py) from a run on a small demo project on 2026-09-13: a CSV
importer that dropped rows when the file started with a BOM. Keeping them here means `make screenshots` can
redraw every picture in the README at the same width, without a live session — and scripts/capture.py is still
what you use to take new ones from a workspace you are running.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from rich.text import Text

sys.path.insert(0, str(Path(__file__).resolve().parent))
from capture import OUT, render

DIM = "#9aa0a6"
GREEN = "#7fc08a"
CYAN = "#58d1eb"
AMBER = "#fd971f"


def line(text: str, style: str = "") -> tuple[str, str]:
    return text, style


MANAGER = [
    ("❯ The CSV import drops rows when the file starts with a BOM. Fix it and add a test.", "bold"),
    ("", ""),
    ("  Called supermanager 2 times", DIM),
    ("⏺ Task T-001 created and an agent has started on it (branch sm/T-001). It will fix the BOM handling in", ""),
    ("  the CSV reader and add a regression test; you'll get its plan to approve first.", ""),
    ("", ""),
    ("✻ Cogitated for 10s · done 2:07 AM", DIM),
    ("──────────────────────────────────────────────────────────────────────────── acme-api-manager ─", DIM),
    ("❯ ", ""),
    ("  /remote-control is active · continue here, on your phone, or at claude.ai/code", DIM),
]

AGENT = [
    ("• importer.py reads without an explicit encoding, allowing the BOM into the first column name.", ""),
    ("  No tests currently exist.", ""),
    ("", ""),
    ("  Plan:", "bold"),
    ("  1. Add a regression test comparing BOM-prefixed and plain CSV imports, checking all rows,", ""),
    ("     headers, and values.", ""),
    ("  2. Set the read encoding to utf-8-sig.", ""),
    ("  3. Run python3 -m pytest -q and commit on sm/T-001.", ""),
    ("", ""),
    ("  Approve this plan? The T-001 workflow requires explicit approval before file changes.", AMBER),
    ("", ""),
    ("› Ask Codex to do anything", DIM),
    ("  gpt-6-astra low · Context 5% used", DIM),
]

MERGE = [
    ("• Committed as 6b131a6; python3 -m pytest -q passes (1 test). The merge would add correct UTF-8 BOM", ""),
    ("  handling and a regression test.", ""),
    ("", ""),
    ("  Commit and merge sm/T-001 into main?", AMBER),
    ("", ""),
    ("› Yes, merge it.", "bold"),
    ("", ""),
    ("• Merged into main (2d72a0e). T-001 is done; closing this session.", GREEN),
]


def body(rows: list[tuple[str, str]]) -> Text:
    out = Text()
    for text, style in rows:
        out.append(text + "\n", style=style or None)
    return out


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, rows in (("walkthrough-manager", MANAGER), ("walkthrough-agent", AGENT), ("walkthrough-merge", MERGE)):
        await render(body(rows), OUT / f"{name}.svg")
        print(f"{name}.svg")


if __name__ == "__main__":
    asyncio.run(main())
