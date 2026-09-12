"""Git worktree helpers for isolating each agent. Open this if a worktree failed to create or clean up."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

CONTEXT_FILES = ("CLAUDE.md", "CLAUDE.local.md", ".mcp.json")
CONTEXT_DIRS = (".claude",)


class GitError(RuntimeError):
    pass


def git(root: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    proc = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True)
    if check and proc.returncode != 0:
        raise GitError(proc.stderr.strip() or f"git {' '.join(args)} failed")
    return proc


def branch_exists(root: Path, branch: str) -> bool:
    return git(root, "rev-parse", "--verify", "--quiet", f"refs/heads/{branch}", check=False).returncode == 0


def add_worktree(root: Path, path: Path, branch: str, base: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        return
    git(root, "worktree", "prune", check=False)
    if branch_exists(root, branch):
        git(root, "worktree", "add", str(path), branch)
    else:
        git(root, "worktree", "add", "-b", branch, str(path), base)
    copy_context_files(root, path)


def remove_worktree(root: Path, path: Path, force: bool = False) -> None:
    args = ["worktree", "remove", str(path)]
    if force:
        args.append("--force")
    git(root, *args)


def copy_context_files(root: Path, worktree: Path) -> None:
    """Make sure the agent sees the project's CLAUDE.md and .claude/ even if they are not committed."""
    for name in CONTEXT_FILES:
        src, dst = root / name, worktree / name
        if src.is_file() and not dst.exists():
            shutil.copy2(src, dst)
    for name in CONTEXT_DIRS:
        src, dst = root / name, worktree / name
        if src.is_dir():
            shutil.copytree(src, dst, dirs_exist_ok=True, ignore=shutil.ignore_patterns("worktrees"))


def worktree_summary(root: Path, path: Path) -> str:
    if not path.exists():
        return "worktree missing"
    status = git(path, "status", "--porcelain", check=False).stdout.strip()
    ahead = git(root, "rev-list", "--count", f"HEAD..{_branch_of(path)}", check=False).stdout.strip()
    dirty = f"{len(status.splitlines())} uncommitted" if status else "clean"
    return f"{dirty}, {ahead or '?'} commits ahead of HEAD"


def _branch_of(path: Path) -> str:
    return git(path, "rev-parse", "--abbrev-ref", "HEAD", check=False).stdout.strip() or "HEAD"
