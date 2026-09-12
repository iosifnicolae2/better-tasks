"""Draw the pages with a made-up backlog and save them as the README's screenshots (`make screenshots`).

They are real renders of the real pages, so they are never out of date with what the tool looks like.
"""
import asyncio, sys, tempfile, time
from pathlib import Path as _P
sys.path.insert(0, str(_P(__file__).resolve().parents[1] / "src"))
from pathlib import Path
from supermanager.config import Config, save_config
from supermanager.models import AgentInfo, TaskStatus
from supermanager.orchestrator import Orchestrator
from supermanager.paths import ProjectPaths
from supermanager.tui.agents_page import AgentsApp
from supermanager.tui.app import SupermanagerApp
from supermanager.tui.config_page import ConfigApp

OUT = _P(__file__).resolve().parents[1] / "docs" / "screenshots"
NOW = time.time()
DEMO = [
    # title, labels, when, status, tool/model, phase, attention, age
    ("Fix the BOM in the CSV import", ["import", "bug"], "2026-W38", TaskStatus.WORKING, ("claude", "opus"), "busy", "", 2400),
    ("Cache the avatar thumbnails", ["perf", "api"], "", TaskStatus.PLANNING, ("codex", "gpt-6-astra"), "idle", "plan ready — approve it", 300),
    ("Retry failed uploads with a backoff", ["api"], "2026-W38", TaskStatus.QUEUED, None, "", "", 0),
    ("Ship the release notes for 0.2", ["docs"], "2026-09-20", TaskStatus.BACKLOG, None, "", "", 0),
    ("Drop the legacy /v1 endpoints", ["api", "cleanup"], "", TaskStatus.BACKLOG, None, "", "", 0),
    ("Make the importer stream large files", ["import", "perf"], "", TaskStatus.DONE, ("claude", "sonnet"), "ended", "", 9000),
]

def build():
    root = Path(tempfile.mkdtemp()).resolve()
    paths = ProjectPaths(root); paths.ensure_layout()
    cfg = Config(project_name="acme-api"); save_config(paths.config, cfg)
    orch = Orchestrator(paths, cfg)
    orch.tmux.kill_window = lambda *a, **k: None
    orch._auto_accept_dialogs = lambda *a, **k: None
    orch.ensure_manager = lambda: None
    orch._require_tmux = lambda: None
    orch.tmux.capture = lambda w, l=40: ""
    orch.tmux.dead_status = lambda w: None
    orch.tmux.window_alive = lambda w: True
    made = []
    for i, (title, labels, when, status, tool, phase, attention, age) in enumerate(DEMO):
        made.append(orch.create_task(title, "p" * 70, "an outcome that is long enough", ["a checkable thing here"],
                                     "run pytest -q here", fields={"labels": labels, "scheduled": when},
                                     priority="P0" if i < 2 else "P1" if i < 4 else "P2"))
    # statuses last: creating a task dispatches the queue, which would start the queued one for real
    for i, (title, labels, when, status, tool, phase, attention, age) in enumerate(DEMO):
        t = made[i]
        t.status = status
        t.created_at = NOW - 86400 * (6 - i) - 3600
        t.updated_at = NOW - age - 60
        if tool:
            t.agent = AgentInfo(session_id="s", tmux_window=f"@{i}", cwd=str(root),
                                rc_name=f"acme-api-{t.id}", tool=tool[0], model=tool[1],
                                branch=f"sm/{t.id}", phase=phase, attention=attention,
                                started_at=NOW - age, last_activity=NOW - age / 4,
                                session_open=status not in (TaskStatus.DONE,))
    return orch, paths

def sessions(orch):
    rows = []
    for t in orch.state.tasks.values():
        if t.agent and t.agent.session_open:
            rows.append({"id": t.id, "title": t.title, "task": True, "status": str(t.status),
                         "agent": {**t.agent.__dict__}})
    rows.append({"id": "A-001", "title": "agent (no task)", "task": False, "status": "",
                 "agent": {"rc_name": "acme-api-A-001", "tmux_window": "@9", "phase": "idle", "branch": None,
                           "started_at": NOW - 5400, "last_activity": NOW - 900, "attention": "",
                           "tool": "claude", "model": "", "effort": "", "session_open": True}})
    return rows

async def main():
    orch, paths = build()
    app = SupermanagerApp(orch)
    async with app.run_test(size=(150, 20)) as pilot:
        for _ in range(4):
            await pilot.pause()
        app.save_screenshot(str(OUT / "tasks.svg"))
        await pilot.press("v"); await pilot.pause(); await pilot.pause()
        app.save_screenshot(str(OUT / "board.svg"))

    agents = AgentsApp(paths)
    rows = sessions(orch)
    agents._poll = lambda: (setattr(agents, "sessions", rows), agents._render())[1]
    agents._poll_events = lambda: None
    async with agents.run_test(size=(150, 12)) as pilot:
        await pilot.pause(); await pilot.pause()
        agents.save_screenshot(str(OUT / "agents.svg"))

    config = ConfigApp(paths)
    async with config.run_test(size=(150, 20)) as pilot:
        await pilot.pause(); await pilot.pause()
        config.save_screenshot(str(OUT / "config.svg"))
    print("\n".join(f"{p.name}: {p.stat().st_size // 1024} KB" for p in sorted(OUT.glob('*.svg'))))

asyncio.run(main())
