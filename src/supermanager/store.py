"""Loads and saves state: tasks as Markdown files in the configured tasks folder, the rest in state.json.

Open this if state looks stale, corrupt, or tasks are not where you expect them.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from .models import State
from .taskfiles import TaskDir

MAX_EVENTS = 500


class StateStore:
    def __init__(self, state_path: Path, tasks_dir: Path):
        self.path = state_path
        self.tasks = TaskDir(tasks_dir)

    def load(self) -> State:
        state = State()
        if self.path.exists():
            try:
                state = State.from_dict(json.loads(self.path.read_text()))
            except (json.JSONDecodeError, TypeError, KeyError) as exc:
                backup = self.path.with_suffix(".corrupt.json")
                self.path.replace(backup)
                raise RuntimeError(f"state.json was unreadable ({exc}); moved it to {backup}") from exc
        tasks, order = self.tasks.load()
        if tasks or not state.tasks:  # task files win; legacy tasks inside state.json are migrated on first save
            self._take(state, tasks, order)
        return state

    def follow(self, state: State) -> bool:
        """A task file changed on disk — your editor, the agent, a git pull: take what the files say now.
        False when nothing changed. A file that does not parse raises; the folder still counts as seen, so a
        half-written file is reported once and picked up again when it is saved next."""
        if not self.tasks.stale():
            return False
        self._take(state, *self.tasks.load())
        return True

    @staticmethod
    def _take(state: State, tasks: dict, order: list[str]) -> None:
        state.tasks, state.order = tasks, order
        state.next_task_number = max([state.next_task_number] + [int(t[2:]) + 1 for t in state.tasks if t[2:].isdigit()])

    def save(self, state: State) -> None:
        state.events = state.events[-MAX_EVENTS:]
        self.tasks.save(state.tasks, state.order)
        slim = {**state.to_dict(), "tasks": {}, "order": [], "tasks_dir": str(self.tasks.path)}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.path.parent, prefix=".state-", suffix=".json")
        with os.fdopen(fd, "w") as f:
            json.dump(slim, f, indent=2)
        os.replace(tmp, self.path)

    def relocate(self, state: State, new_dir: Path) -> None:
        """Move the task files to another folder (used when tasks.path changes)."""
        old = self.tasks
        self.tasks = TaskDir(new_dir)
        self.save(state)
        if old.path.resolve() != new_dir.resolve():
            old.remove_all()
