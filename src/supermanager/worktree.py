"""Git worktree helpers for isolating each agent. Open this if a worktree failed to create or clean up."""

from __future__ import annotations

import os
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
        # A failed merge says what went wrong on stdout ("CONFLICT ... Automatic merge failed"), not on stderr;
        # the lines that name the problem are the ones worth passing on.
        detail = proc.stderr.strip() or _problem_lines(proc.stdout)
        raise GitError(detail or f"git {' '.join(args)} failed")
    return proc


def _problem_lines(output: str) -> str:
    lines = [l.strip() for l in output.splitlines() if l.strip()]
    named = [l for l in lines if l.startswith(("CONFLICT", "error:", "fatal:")) or "failed" in l.lower()]
    return " ".join(named or lines[-2:])


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


def current_branch(root: Path) -> str:
    return git(root, "rev-parse", "--abbrev-ref", "HEAD", check=False).stdout.strip()


def is_dirty(path: Path, untracked: bool = True, ignore_supermanager: bool = False) -> bool:
    """Changes in a checkout.

    `untracked=False` counts only tracked files — that is what blocks a merge. `ignore_supermanager` also skips
    `.supermanager/`: the daemon rewrites the task files all the time, and that must not block a merge."""
    args = ["status", "--porcelain"] + ([] if untracked else ["--untracked-files=no"])
    if ignore_supermanager:
        args += ["--", ".", ":(exclude).supermanager", ":(exclude,glob).supermanager/**"]
    return bool(git(path, *args, check=False).stdout.strip())


def commit_all(path: Path, message: str) -> bool:
    """Commit everything in a worktree. False when there was nothing to commit."""
    if not is_dirty(path):
        return False
    git(path, "add", "-A")
    git(path, "commit", "-m", message)
    return True


def conflicting_files(root: Path, branch: str, into: str) -> list[str]:
    """Which files would clash if `branch` were merged into `into`. Nothing is checked out or changed.

    `git merge-tree` prints the merged tree id, then the conflicted paths, then its messages; a non-zero exit
    means it could not merge on its own."""
    proc = git(root, "merge-tree", "--write-tree", "--name-only", into, branch, check=False)
    if proc.returncode == 0:
        return []
    lines = [line.strip() for line in proc.stdout.splitlines()]
    paths = []
    for line in lines[1:]:
        if not line or line.startswith(("Auto-merging", "CONFLICT", "warning:", "error:")):
            break
        paths.append(line)
    return paths


def merge_branch(root: Path, branch: str, into: str, message: str) -> str:
    """Merge an agent's branch into `into` in the main checkout. Raises GitError with git's own words when it
    cannot: a dirty checkout, a conflict (the merge is aborted first), an unknown branch."""
    if not branch_exists(root, branch):
        raise GitError(f"branch {branch} does not exist")
    if is_dirty(root, untracked=False, ignore_supermanager=True):
        raise GitError(f"the project checkout has uncommitted changes; commit or stash them, then merge {branch}")
    here = current_branch(root)
    if here != into:
        git(root, "checkout", into)
    try:
        git(root, "merge", "--no-ff", "-m", message, branch)
    except GitError:
        git(root, "merge", "--abort", check=False)
        if here != into:
            git(root, "checkout", here, check=False)
        raise
    return git(root, "log", "-1", "--oneline", check=False).stdout.strip()


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


def prune(root: Path) -> None:
    """Forget worktrees whose folder is already gone."""
    git(root, "worktree", "prune", check=False)


def folder_size(path: Path) -> int:
    """Bytes on disk under a folder; unreadable entries are skipped."""
    total = 0
    stack = [path]
    while stack:
        try:
            with os.scandir(stack.pop()) as entries:
                for entry in entries:
                    if entry.is_dir(follow_symlinks=False):
                        stack.append(Path(entry.path))
                    elif entry.is_file(follow_symlinks=False):
                        total += entry.stat(follow_symlinks=False).st_size
        except OSError:
            continue
    return total


def human_size(size: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} GB"


def worktree_summary(root: Path, path: Path) -> str:
    if not path.exists():
        return "worktree missing"
    status = git(path, "status", "--porcelain", check=False).stdout.strip()
    ahead = git(root, "rev-list", "--count", f"HEAD..{_branch_of(path)}", check=False).stdout.strip()
    dirty = f"{len(status.splitlines())} uncommitted" if status else "clean"
    return f"{dirty}, {ahead or '?'} commits ahead of HEAD"


def _branch_of(path: Path) -> str:
    return git(path, "rev-parse", "--abbrev-ref", "HEAD", check=False).stdout.strip() or "HEAD"
