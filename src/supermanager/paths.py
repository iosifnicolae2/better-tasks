"""Where supermanager keeps its files for a project. Open this when a path looks wrong."""

from __future__ import annotations

import hashlib
import os
import subprocess
from pathlib import Path

DIR_NAME = ".supermanager"
RUNTIME_DIR = Path.home() / ".local" / "state" / "supermanager" / "run"


def find_project_root(start: Path | None = None) -> Path:
    """Walk up from `start`; the nearest folder that has a .supermanager/config.toml or is a git repo wins.

    An agent's git worktree is a repo of its own, so from inside one we ask git for the checkout it belongs to:
    that is the project, and it is what a hook or an MCP bridge running in a worktree must find.
    The home directory and the filesystem root are never treated as a project.
    """
    start = (start or Path.cwd()).resolve()
    home = Path.home().resolve()
    for candidate in [start, *start.parents]:
        if candidate in (home, Path("/")):
            break
        if (candidate / ".git").exists():
            # A worktree carries a copy of the project's committed files, .supermanager/config.toml included.
            # The project is the checkout it was made from, never the worktree itself.
            main = main_checkout(candidate)
            if main and main != candidate and (main / DIR_NAME / "config.toml").is_file():
                return main
            return candidate
        if (candidate / DIR_NAME / "config.toml").is_file():
            return candidate
    return start


def main_checkout(path: Path) -> Path | None:
    """The checkout a git worktree belongs to (git keeps one common dir, `<main>/.git`, for all of them)."""
    try:
        out = subprocess.run(["git", "-C", str(path), "rev-parse", "--path-format=absolute", "--git-common-dir"],
                             capture_output=True, text=True, check=True).stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    common = Path(out) if out else None
    return common.parent if common and common.is_dir() else None


def _git_toplevel(path: Path) -> Path | None:
    try:
        out = subprocess.run(
            ["git", "-C", str(path), "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        return Path(out) if out else None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


SKILL_MD = """\
---
name: supermanager-workspace
description: What .supermanager/ holds, what is committed, and how to override settings for yourself.
---

# The `.supermanager/` folder

supermanager keeps a project's backlog and its agent sessions here. Open this file when you clone a project
that uses it, or when you wonder why something in this folder is (or is not) in git.

## Committed, so the team shares it

| file | what it is |
| --- | --- |
| `config.toml` | the project's settings: concurrency, worktrees, the agent tool, models, effort |
| `tasks/T-001.md` | one file per task: problem, criteria, plan, progress, result, and every session that worked on it |
| `tasks/_index.json` | the dispatch order of the backlog |
| `SKILL.md` | this file |

`tasks.in_git = false` keeps the backlog on your machine instead (a `.gitignore` appears in the tasks folder).

## Local, never committed

`state.json`, `agents/`, `worktrees/`, `logs/`, `*.sock` — the running state of this machine, the files each
session is started with, the agents' git worktrees, and the transcripts copied to
`agents/<task-id>/transcripts/` when a session ends (`agents.keep_transcripts`).

## Extra fields on a task

Tasks carry `labels` and a `scheduled` date out of the box. A project adds its own in `config.toml`:

```toml
[[tasks.fields]]
name = "component"
type = "text"       # text | list | date | number
column = "Part"     # a column on the tasks page; leave it out to keep the field off the table
width = 14
help = "Which part of the system this touches."
```

The manager fills them when you mention one, `supermanager tasks --label api` and
`--field scheduled --value 2026-W38` filter by them, and `ctrl+w` on the tasks page searches every column.

## Making it yours: `config.local.toml`

Settings you do not want to impose on the team go in `.supermanager/config.local.toml`. It is read on top of
`config.toml` and it is gitignored. Only the keys you write are overridden:

```toml
[tasks]
editor = "code"        # your editor, not the project's

[agents]
concurrency = 1        # a laptop, not a workstation
model = "opus"
```

`supermanager config show` prints the result; `supermanager config set <key> <value>` writes `config.toml` and
tells you when `config.local.toml` shadows what you just set.

## Nothing here names your machine

The files a session is started with (`agents/<id>/mcp.json`, `settings.json`, and the Codex `.codex/hooks.json`)
call `supermanager` by name and read `SUPERMANAGER_PROJECT` / `SUPERMANAGER_TASK` from the session's own
environment. They are regenerated on every spawn, so a clone on another machine works without touching them.
"""


class ProjectPaths:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.home = self.root / DIR_NAME

    @property
    def config(self) -> Path:
        return self.home / "config.toml"

    @property
    def state(self) -> Path:
        return self.home / "state.json"

    @property
    def agents_dir(self) -> Path:
        return self.home / "agents"

    @property
    def worktrees_dir(self) -> Path:
        return self.home / "worktrees"

    @property
    def logs_dir(self) -> Path:
        return self.home / "logs"

    @property
    def gitignore(self) -> Path:
        return self.home / ".gitignore"

    @property
    def skill(self) -> Path:
        """What this folder is and how to make it yours; written on init, read by people and by agents."""
        return self.home / "SKILL.md"

    @property
    def socket(self) -> Path:
        """Fixed, short path under $HOME: macOS limits socket paths, and MCP hosts strip TMPDIR from the env."""
        digest = hashlib.sha1(str(self.root).encode()).hexdigest()[:12]
        return RUNTIME_DIR / f"{digest}.sock"

    def tasks_dir(self, configured: str) -> Path:
        p = Path(configured).expanduser()
        return p if p.is_absolute() else self.root / p

    def agent_dir(self, task_id: str) -> Path:
        return self.agents_dir / task_id

    def transcripts_dir(self, task_id: str) -> Path:
        """Where a session's transcript is copied. Under agents/, which is never in git."""
        return self.agent_dir(task_id) / "transcripts"

    def worktree_path(self, task_id: str) -> Path:
        return self.worktrees_dir / task_id

    IGNORED = ("state.json", "agents/", "worktrees/", "logs/", "*.sock", "config.local.toml")

    def ensure_layout(self) -> None:
        for d in (self.home, self.agents_dir, self.logs_dir):
            d.mkdir(parents=True, exist_ok=True)
        self._write_gitignore()
        if not self.skill.exists():
            self.skill.write_text(SKILL_MD)

    def _write_gitignore(self) -> None:
        """What of .supermanager/ stays on this machine. Missing lines are added to an older file."""
        header = "# config.toml, the task files and SKILL.md are meant to be committed; the rest is local.\n"
        lines = self.gitignore.read_text().splitlines() if self.gitignore.exists() else [header.rstrip()]
        missing = [entry for entry in self.IGNORED if entry not in lines]
        if missing:
            self.gitignore.write_text("\n".join([*lines, *missing]) + "\n")

    def is_git_repo(self) -> bool:
        return _git_toplevel(self.root) is not None
