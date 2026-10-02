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

SECTIONS = ("Problem", "Expected outcome", "Acceptance criteria", "Verification", "Context", "Asked for",
            "Plan", "Progress", "Result")
STAMP = "%Y-%m-%d %H:%M"
FRONT_KEYS = ("id", "title", "priority", "fields", "group", "workdir", "tool", "model", "effort", "autonomy", "planning", "plan_approved",
              "status", "usage", "budget_tokens", "budget_usd", "budget_hit",
              "created_at", "updated_at", "blocked_reason", "result_ts", "agent", "sessions")
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
        "id": t.id, "title": t.title, "priority": t.priority, "fields": t.fields,
        "group": t.group, "workdir": t.workdir,
        "tool": t.tool, "model": t.model, "effort": t.effort, "autonomy": t.autonomy,
        "planning": t.planning, "plan_approved": t.plan_approved, "status": str(t.status),
        "usage": t.usage, "budget_tokens": t.budget_tokens, "budget_usd": t.budget_usd,
        "budget_hit": t.budget_hit,
        "created_at": t.created_at, "updated_at": t.updated_at, "blocked_reason": t.blocked_reason,
        "result_ts": t.result.get("ts") if t.result else None,
        "agent": t.agent.__dict__ if t.agent else None,
        "sessions": t.sessions,
    }
    lines = ["---"] + [f"{k}: {json.dumps(v)}" for k, v in front.items()] + ["---", "", f"# {t.id} · {t.title}", ""]
    lines += ["## Problem", t.problem, "", "## Expected outcome", t.expected_outcome, "", "## Acceptance criteria"]
    lines += [f"- {c}" for c in t.acceptance_criteria] + ["", "## Verification", t.verification, "", "## Context", t.context, ""]
    lines += ["## Asked for"] + [f"- {time.strftime(STAMP, time.localtime(r['ts']))} — {r['text']}"
                                 for r in t.requests] + [""]
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
        group=front.get("group") or "", workdir=front.get("workdir") or "",
        tool=front.get("tool") or "", model=front.get("model") or "", effort=front.get("effort") or "",
        autonomy=front.get("autonomy") or "", planning=front.get("planning") or "",
        plan_approved=bool(front.get("plan_approved")),
        fields=front.get("fields") or {}, usage=front.get("usage") or {},
        budget_tokens=front.get("budget_tokens") or 0, budget_usd=front.get("budget_usd") or 0.0,
        budget_hit=front.get("budget_hit") or "",
        problem=body["Problem"], expected_outcome=body["Expected outcome"],
        acceptance_criteria=[l[2:].strip() for l in body["Acceptance criteria"].splitlines() if l.startswith("- ")],
        verification=body["Verification"], context=body["Context"], plan=body["Plan"],
        agent=AgentInfo(**front["agent"]) if front.get("agent") else None,
        sessions=front.get("sessions") or [],
        progress=[_progress_item(l) for l in body["Progress"].splitlines() if l.startswith("- ")],
        requests=[_logged_line(l) for l in body["Asked for"].splitlines() if l.startswith("- ")],
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
    entry = _logged_line(line)
    return {"ts": entry["ts"], "note": entry["text"]}


def _logged_line(line: str) -> dict:
    """`- 2026-09-13 01:52 — what was said` back into {ts, text}."""
    stamp, _, text = line[2:].partition(" — ")
    try:
        ts = time.mktime(time.strptime(stamp.strip(), STAMP))
    except ValueError:
        ts, text = 0.0, line[2:]
    return {"ts": ts, "text": text.strip()}


class TaskDir:
    """The folder of task files. It remembers what the files looked like when it last read or wrote them, so
    an edit made by hand — your editor, the agent, git — is told apart from its own writes (`stale`)."""

    def __init__(self, path: Path):
        self.path = path
        self.seen = self._stamps()
        self.unreadable: dict[str, int] = {}   # the folder as it was when a file in it would not parse

    @property
    def index(self) -> Path:
        return self.path / "_index.json"

    def _stamps(self) -> dict[str, int]:
        if not self.path.is_dir():
            return {}
        files = [*self.path.glob("T-*.md"), *([self.index] if self.index.exists() else [])]
        return {f.name: f.stat().st_mtime_ns for f in files}

    def changed_outside(self) -> set[str]:
        """The files that changed on disk since we last read or wrote them — edited, added, or deleted."""
        now = self._stamps()
        return {name for name in now.keys() | self.seen.keys() if now.get(name) != self.seen.get(name)}

    def stale(self) -> bool:
        """Something changed on disk that we have not taken in — unless it is the file that would not parse
        last time, still as it was: that was reported once, and waits until it is saved again."""
        return bool(self.changed_outside()) and self._stamps() != self.unreadable

    def mark_seen(self) -> None:
        self.seen = self._stamps()

    def load(self) -> tuple[dict[str, Task], list[str]]:
        """Every task file and the order. A file that will not parse raises, and nothing counts as read: it
        stays theirs, so a save does not write over it."""
        stamps = self._stamps()
        try:
            tasks, order = self._read()
        except Exception:
            self.unreadable = stamps
            raise
        self.seen, self.unreadable = stamps, {}
        return tasks, order

    def _read(self) -> tuple[dict[str, Task], list[str]]:
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
        """Write what memory holds — except a file someone changed on disk meanwhile: that edit is newer than
        what we have, so it is left as it is (and stays `stale`, for the next load to take in)."""
        self.path.mkdir(parents=True, exist_ok=True)
        theirs = self.changed_outside()
        wanted = set()
        for task in tasks.values():
            file = self.path / f"{task.id}.md"
            wanted.add(file.name)
            if file.name in theirs:
                continue
            text = render_task(task)
            if not file.exists() or file.read_text() != text:
                _atomic_write(file, text)
        for stale in self.path.glob("T-*.md"):
            if stale.name not in wanted and stale.name not in theirs:
                stale.unlink()
        index_text = json.dumps({"order": order, "note": "dispatch order of the task files in this folder"}, indent=2) + "\n"
        if self.index.name not in theirs and (not self.index.exists() or self.index.read_text() != index_text):
            _atomic_write(self.index, index_text)
        seen = self._stamps()
        for name in theirs:   # still theirs: keep the old stamp so the change is picked up
            if name in self.seen:
                seen[name] = self.seen[name]
            else:
                seen.pop(name, None)
        self.seen = seen

    def remove_all(self) -> None:
        for file in self.path.glob("T-*.md"):
            file.unlink()
        if self.index.exists():
            self.index.unlink()
        try:
            self.path.rmdir()
        except OSError:
            pass
        self.mark_seen()


def _atomic_write(path: Path, text: str) -> None:
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-", suffix=path.suffix)
    with os.fdopen(fd, "w") as f:
        f.write(text)
    os.replace(tmp, path)
