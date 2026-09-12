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

    The home directory and the filesystem root are never treated as a project.
    """
    start = (start or Path.cwd()).resolve()
    home = Path.home().resolve()
    for candidate in [start, *start.parents]:
        if candidate in (home, Path("/")):
            break
        if (candidate / DIR_NAME / "config.toml").is_file() or (candidate / ".git").exists():
            return candidate
    return start


def _git_toplevel(path: Path) -> Path | None:
    try:
        out = subprocess.run(
            ["git", "-C", str(path), "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        return Path(out) if out else None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


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
    def socket(self) -> Path:
        """Fixed, short path under $HOME: macOS limits socket paths, and MCP hosts strip TMPDIR from the env."""
        digest = hashlib.sha1(str(self.root).encode()).hexdigest()[:12]
        return RUNTIME_DIR / f"{digest}.sock"

    def tasks_dir(self, configured: str) -> Path:
        p = Path(configured).expanduser()
        return p if p.is_absolute() else self.root / p

    def agent_dir(self, task_id: str) -> Path:
        return self.agents_dir / task_id

    def worktree_path(self, task_id: str) -> Path:
        return self.worktrees_dir / task_id

    def ensure_layout(self) -> None:
        for d in (self.home, self.agents_dir, self.logs_dir):
            d.mkdir(parents=True, exist_ok=True)
        if not self.gitignore.exists():
            self.gitignore.write_text(
                "# Only config.toml is meant to be committed.\n"
                "state.json\nagents/\nworktrees/\nlogs/\n*.sock\n"
            )

    def is_git_repo(self) -> bool:
        return _git_toplevel(self.root) is not None
