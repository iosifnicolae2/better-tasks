"""Tasks on disk: one Markdown file per task (T-001.md) plus _index.json for the order.

Open this when a task file looks wrong or fails to load. The frontmatter holds machine fields (JSON values);
the body holds the human text, so the files read well in git and in an editor.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
import time
from pathlib import Path

from .models import AgentInfo, Task

SECTIONS = ("Problem", "Expected outcome", "Acceptance criteria", "Verification", "Context", "Plan", "Progress",
            "Result")
STAMP = "%Y-%m-%d %H:%M"
FRONT_KEYS = ("id", "title", "priority", "tool", "model", "effort", "status", "created_at", "updated_at",
              "blocked_reason", "result_ts", "agent", "sessions")
TEMPLATE_NAME = "task-template.md"   # put one in .supermanager/ to override DEFAULT_TEMPLATE for a project

DEFAULT_TEMPLATE = """\
## Problem
What is wrong or wanted, where it shows up, and how it manifests today.

## Expected outcome
What "done" looks like once the task is finished.

## Acceptance criteria
- An observable statement a person or a command can confirm true or false.
- Another one.

## Verification
How to check it: a command (tests, script, build) or precise manual steps.

## Context
Files, modules, links, constraints, and anything from CLAUDE.md the agent must respect.
"""


def render_task(t: Task) -> str:
    front = {
        "id": t.id, "title": t.title, "priority": t.priority,
        "tool": t.tool, "model": t.model, "effort": t.effort, "status": str(t.status),
        "created_at": t.created_at, "updated_at": t.updated_at, "blocked_reason": t.blocked_reason,
        "result_ts": t.result.get("ts") if t.result else None,
        "agent": t.agent.__dict__ if t.agent else None,
        "sessions": t.sessions,
    }
    lines = ["---"] + [f"{k}: {json.dumps(v)}" for k, v in front.items()] + ["---", "", f"# {t.id} · {t.title}", ""]
    lines += ["## Problem", t.problem, "", "## Expected outcome", t.expected_outcome, "", "## Acceptance criteria"]
    lines += [f"- {c}" for c in t.acceptance_criteria] + ["", "## Verification", t.verification, "", "## Context", t.context, ""]
    lines += ["## Plan", t.plan, ""]
    lines += ["## Progress"] + [f"- {time.strftime(STAMP, time.localtime(p['ts']))} — {p['note']}" for p in t.progress] + [""]
    lines += ["## Result"]
    if t.result:
        lines += [t.result["summary"], "", "### Verification notes", t.result["verification_notes"]]
    return "\n".join(lines).rstrip() + "\n"


def load_template(home: Path) -> str:
    """The project's task template (.supermanager/task-template.md) or the built-in one."""
    custom = home / TEMPLATE_NAME
    return custom.read_text() if custom.is_file() else DEFAULT_TEMPLATE


def task_from_template(task_id: str, title: str, template: str, priority: str = "P2") -> Task:
    """A task whose body comes straight from the template; the user fills it in with an editor."""
    body = _sections(template)
    return Task(
        id=task_id, title=title.strip(), priority=priority,
        problem=body["Problem"], expected_outcome=body["Expected outcome"],
        acceptance_criteria=[l[2:].strip() for l in body["Acceptance criteria"].splitlines() if l.startswith("- ")],
        verification=body["Verification"], context=body["Context"],
    )


def parse_task(text: str, source: str = "?") -> Task:
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        raise ValueError(f"{source}: missing frontmatter")
    front: dict = {}
    for line in m.group(1).splitlines():
        key, _, raw = line.partition(":")
        if key.strip() in FRONT_KEYS:
            front[key.strip()] = json.loads(raw.strip())
    body = _sections(m.group(2))
    result = None
    if front.get("result_ts") is not None or body["Result"].strip():
        summary, _, notes = body["Result"].partition("### Verification notes")
        result = {"summary": summary.strip(), "verification_notes": notes.strip(), "ts": front.get("result_ts") or 0}
    return Task(
        id=front["id"], title=front["title"], priority=front.get("priority", "P2"), status=front.get("status", "backlog"),
        tool=front.get("tool") or "", model=front.get("model") or "", effort=front.get("effort") or "",
        problem=body["Problem"], expected_outcome=body["Expected outcome"],
        acceptance_criteria=[l[2:].strip() for l in body["Acceptance criteria"].splitlines() if l.startswith("- ")],
        verification=body["Verification"], context=body["Context"], plan=body["Plan"],
        agent=AgentInfo(**front["agent"]) if front.get("agent") else None,
        sessions=front.get("sessions") or [],
        progress=[_progress_item(l) for l in body["Progress"].splitlines() if l.startswith("- ")],
        result=result, blocked_reason=front.get("blocked_reason"),
        created_at=front.get("created_at", 0.0), updated_at=front.get("updated_at", 0.0),
    )


def _sections(body: str) -> dict[str, str]:
    out = {name: "" for name in SECTIONS}
    current = None
    for line in body.splitlines():
        header = line[3:].strip() if line.startswith("## ") else None
        if header in SECTIONS:
            current = header
            continue
        if current:
            out[current] += line + "\n"
    return {k: v.strip() for k, v in out.items()}


def _progress_item(line: str) -> dict:
    stamp, _, note = line[2:].partition(" — ")
    try:
        ts = time.mktime(time.strptime(stamp.strip(), STAMP))
    except ValueError:
        ts, note = 0.0, line[2:]
    return {"ts": ts, "note": note.strip()}


class TaskDir:
    def __init__(self, path: Path):
        self.path = path

    @property
    def index(self) -> Path:
        return self.path / "_index.json"

    def load(self) -> tuple[dict[str, Task], list[str]]:
        tasks: dict[str, Task] = {}
        if not self.path.is_dir():
            return tasks, []
        for file in sorted(self.path.glob("T-*.md")):
            task = parse_task(file.read_text(), str(file))
            tasks[task.id] = task
        order: list[str] = []
        if self.index.exists():
            order = [t for t in json.loads(self.index.read_text()).get("order", []) if t in tasks]
        order += [t for t in tasks if t not in order]
        return tasks, order

    def save(self, tasks: dict[str, Task], order: list[str]) -> None:
        self.path.mkdir(parents=True, exist_ok=True)
        wanted = set()
        for task in tasks.values():
            file = self.path / f"{task.id}.md"
            wanted.add(file.name)
            text = render_task(task)
            if not file.exists() or file.read_text() != text:
                _atomic_write(file, text)
        for stale in self.path.glob("T-*.md"):
            if stale.name not in wanted:
                stale.unlink()
        index_text = json.dumps({"order": order, "note": "dispatch order of the task files in this folder"}, indent=2) + "\n"
        if not self.index.exists() or self.index.read_text() != index_text:
            _atomic_write(self.index, index_text)

    def remove_all(self) -> None:
        for file in self.path.glob("T-*.md"):
            file.unlink()
        if self.index.exists():
            self.index.unlink()
        try:
            self.path.rmdir()
        except OSError:
            pass


def _atomic_write(path: Path, text: str) -> None:
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-", suffix=path.suffix)
    with os.fdopen(fd, "w") as f:
        f.write(text)
    os.replace(tmp, path)
