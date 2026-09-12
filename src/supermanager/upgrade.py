"""Keeping supermanager itself up to date. Open this when `supermanager upgrade` says something unexpected.

There are two ways supermanager ends up on a machine, and they are updated differently:

- **managed** — `install.sh` cloned it to `~/.local/share/supermanager/src`. It follows releases: `upgrade`
  moves that clone to the newest release tag, and `up` says once a day when a newer one exists.
- **checkout** — you cloned it yourself to work on it. It is yours: no notices, no pulling behind your back.
  The one exception is a fork whose upstream has published a release you do not have yet; then we say so.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from . import __version__
from .paths import RUNTIME_DIR

UPSTREAM_URL = "https://github.com/bringes/supermanager"
MANAGED_DIR = Path.home() / ".local" / "share" / "supermanager" / "src"
CHECK_EVERY = 24 * 3600            # how often `supermanager up` looks for a new release
STAMP = RUNTIME_DIR.parent / "upgrade.json"
# A release is a tag written `v0.1.0` — that shape and no other. The package's own version has no `v`
# (pyproject.toml cannot), so `release()` puts it back whenever a version is shown or compared.
RELEASE_TAG = re.compile(r"^v(\d+)\.(\d+)\.(\d+)$")


class UpgradeError(RuntimeError):
    pass


def source_dir() -> Path | None:
    """The checkout this install runs from, or None when supermanager was installed some other way."""
    here = Path(__file__).resolve().parents[2]
    return here if (here / ".git").exists() and (here / "pyproject.toml").is_file() else None


def _git(root: Path | None, *args: str, check: bool = True) -> str:
    cmd = ["git"] + (["-C", str(root)] if root else []) + list(args)
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if check and proc.returncode != 0:
        raise UpgradeError(proc.stderr.strip() or f"git {' '.join(args)} failed")
    return proc.stdout.strip()


def release(version: str) -> str:
    """A version as a release is written: v0.1.0."""
    version = version.strip()
    return version if version.startswith("v") else f"v{version}"


def _version(text: str) -> tuple[int, int, int] | None:
    m = RELEASE_TAG.match(release(text))
    return (int(m[1]), int(m[2]), int(m[3])) if m else None


def latest_release(url: str) -> str | None:
    """The newest release tag a repository publishes (`git ls-remote`, so no GitHub API and no token)."""
    try:
        out = _git(None, "ls-remote", "--tags", "--refs", url, check=False)
    except OSError:
        return None
    tags = [line.split("refs/tags/")[-1] for line in out.splitlines() if "refs/tags/" in line]
    versions = sorted((v, t) for t in tags if RELEASE_TAG.match(t) and (v := _version(t)))
    return versions[-1][1] if versions else None


@dataclass
class Status:
    source: Path
    kind: str            # managed | checkout
    branch: str
    origin: str
    dirty: bool
    release: str | None  # the newest release this install can move to
    upstream_release: str | None = None   # for a fork: what the original has published

    @property
    def is_fork(self) -> bool:
        return self.kind == "checkout" and bool(self.origin) and not _same_repo(self.origin, UPSTREAM_URL)

    @property
    def behind_release(self) -> bool:
        return _newer(self.release, __version__)

    @property
    def behind_upstream(self) -> bool:
        return _newer(self.upstream_release, __version__)

    def notice(self) -> str:
        """One line for `supermanager up`, or "" when there is nothing worth saying."""
        if self.kind == "managed" and self.behind_release:
            return f"supermanager {self.release} is out (you run {release(__version__)}) — run `supermanager upgrade`."
        if self.is_fork and self.behind_upstream:
            return (f"Your fork is on {release(__version__)}; upstream released {self.upstream_release} — "
                    f"`git -C {self.source} pull {UPSTREAM_URL} main` to catch up.")
        return ""


def _same_repo(a: str, b: str) -> bool:
    strip = lambda url: url.strip().removesuffix(".git").replace("git@github.com:", "github.com/") \
                            .replace("https://", "").replace("ssh://", "").rstrip("/").lower()
    return strip(a) == strip(b)


def _newer(candidate: str | None, current: str) -> bool:
    new, now = _version(candidate or ""), _version(current)
    return bool(new and now and new > now)


def check(remote: bool = True) -> Status | None:
    """Where this install stands. None when it is not a git checkout at all (nothing to upgrade)."""
    source = source_dir()
    if not source:
        return None
    kind = "managed" if source == MANAGED_DIR.resolve() or source == MANAGED_DIR else "checkout"
    origin = _git(source, "remote", "get-url", "origin", check=False)
    status = Status(
        source=source, kind=kind,
        branch=_git(source, "rev-parse", "--abbrev-ref", "HEAD", check=False) or "main",
        origin=origin,
        dirty=bool(_git(source, "status", "--porcelain", "--untracked-files=no", check=False)),
        release=latest_release(origin or UPSTREAM_URL) if remote and origin else None,
    )
    if remote and status.is_fork:
        status.upstream_release = latest_release(UPSTREAM_URL)
    _write_stamp()
    return status


def upgrade() -> str:
    """Move a managed install to the newest release. A checkout of your own is left alone."""
    status = check()
    if not status:
        raise UpgradeError("This supermanager was not installed from a git checkout; run install.sh to update it.")
    if status.kind == "checkout":
        hint = (f" Upstream released {status.upstream_release}." if status.behind_upstream else "")
        raise UpgradeError(f"{status.source} is your own checkout — update it the way you want, e.g. "
                           f"`git -C {status.source} pull`.{hint}")
    if status.dirty:
        raise UpgradeError(f"{status.source} has uncommitted changes; commit or stash them first.")
    if not status.behind_release:
        return f"Already on the newest release ({release(__version__)})."
    before = _git(status.source, "rev-parse", "HEAD")
    _git(status.source, "fetch", "--tags", "--quiet", "origin")
    _git(status.source, "checkout", "--quiet", status.release or "main")
    changed = _git(status.source, "diff", "--name-only", before, "HEAD", check=False).splitlines()
    lines = [f"Updated to {status.release} ({len(changed)} file(s) changed)."]
    if "pyproject.toml" in changed or "uv.lock" in changed:
        lines.append(_reinstall(status.source))
    lines.append("Open workspaces keep running the old code: restart them to pick this up.")
    return "\n".join(lines)


def _reinstall(source: Path) -> str:
    if not shutil.which("uv"):
        return "Dependencies changed but uv is not on PATH; run install.sh yourself."
    proc = subprocess.run(["uv", "tool", "install", "--editable", str(source), "--force"],
                          capture_output=True, text=True)
    return "Dependencies changed: reinstalled." if proc.returncode == 0 else \
        f"Dependencies changed and the reinstall failed: {proc.stderr.strip()[:200]}"


@dataclass
class Install:
    """What supermanager runs from, as far as the manager needs to know it."""
    source: Path
    kind: str                    # managed (install.sh) | checkout (you cloned it)
    origin: str
    is_fork: bool
    public: bool | None          # None when we could not tell
    upstream: str = UPSTREAM_URL

    @property
    def editable(self) -> bool:
        """A clone of your own is yours to change; a managed install is replaced by the next upgrade."""
        return self.kind == "checkout"

    @property
    def can_contribute(self) -> bool:
        return self.is_fork and self.public is not False


def install() -> Install | None:
    """Where supermanager itself lives and whether its remote is a public fork of the original. None when it was
    not installed from a git checkout. Costs one `gh repo view` (5 s at most) and nothing when gh is missing."""
    status = check(remote=False)
    if not status:
        return None
    public = _is_public(status.origin) if status.origin else None
    return Install(source=status.source, kind=status.kind, origin=status.origin,
                   is_fork=status.is_fork, public=public)


def _is_public(origin: str) -> bool | None:
    if not shutil.which("gh"):
        return None
    try:
        proc = subprocess.run(["gh", "repo", "view", origin, "--json", "isPrivate"],
                              capture_output=True, text=True, timeout=5)
        return not json.loads(proc.stdout)["isPrivate"] if proc.returncode == 0 else None
    except (OSError, ValueError, KeyError, subprocess.TimeoutExpired):
        return None


def due() -> bool:
    """True when the last look is older than a day, so starting a workspace stays quiet and cheap."""
    try:
        return time.time() - json.loads(STAMP.read_text())["ts"] > CHECK_EVERY
    except (OSError, ValueError, KeyError):
        return True


def _write_stamp() -> None:
    try:
        STAMP.parent.mkdir(parents=True, exist_ok=True)
        STAMP.write_text(json.dumps({"ts": time.time()}))
    except OSError:
        pass


# ---------------------------------------------------------------- reloading this machine's own workspaces
SMOKE_TIMEOUT = 60


def smoke_test() -> tuple[bool, str]:
    """Does supermanager still start with the code as it is now? Runs the real command in a subprocess, so a
    syntax error, a bad import or a broken CLI definition is caught before anything is restarted."""
    exe = shutil.which("supermanager")
    argv = [exe] if exe else [sys.executable, "-m", "supermanager"]
    try:
        proc = subprocess.run([*argv, "--version"], capture_output=True, text=True, timeout=SMOKE_TIMEOUT)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return False, f"supermanager --version did not finish: {exc}"
    if proc.returncode != 0:
        return False, (proc.stderr or proc.stdout).strip()
    return True, proc.stdout.strip()


def restart_workspace(project: Path, task_id: str | None = None) -> None:
    """Restart a project's daemon and pages so they run the current code, without touching its agents.

    Detached on purpose: the process doing the restart is one of the processes being restarted."""
    exe = shutil.which("supermanager")
    argv = ([exe] if exe else [sys.executable, "-m", "supermanager"]) + ["self-restart", "--project", str(project)]
    if task_id:
        argv += ["--task", task_id]
    subprocess.Popen(argv, start_new_session=True,
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
