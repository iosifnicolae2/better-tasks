"""What we can learn about a session from its process: which one it is, whether it still runs, where it runs.

The hooks of a session run as its children, so a hook can find the claude/codex process it belongs to by walking
up its parents. The daemon then follows that process: alive or gone, in a terminal or spawned by Remote Control.
"""

from __future__ import annotations

import os
import subprocess
import time
from pathlib import PurePath

TOOLS = ("claude", "codex")


def _proc(pid: int) -> tuple[int, str, str] | None:
    """(parent pid, tty, command line) of a process, None when it is gone."""
    out = subprocess.run(["ps", "-o", "ppid=,tty=,command=", "-p", str(pid)],
                         capture_output=True, text=True).stdout.split(None, 2)
    if len(out) < 2:
        return None
    return int(out[0]), out[1], out[2].strip() if len(out) > 2 else ""


def ancestors(pid: int) -> list[tuple[int, str, str]]:
    """(pid, tty, command) of the process and every parent up to init."""
    chain = []
    while pid > 1 and len(chain) < 20:
        proc = _proc(pid)
        if not proc:
            break
        ppid, tty, command = proc
        chain.append((pid, tty, command))
        pid = ppid
    return chain


def _is_tool(command: str) -> bool:
    return PurePath(command.split(None, 1)[0]).name in TOOLS if command else False


def session_pid() -> int:
    """From inside a hook: the claude/codex process the hook runs under (0 when there is none)."""
    return next((pid for pid, _, command in ancestors(os.getpid()) if _is_tool(command)), 0)


def alive(pid: int) -> bool:
    return pid > 0 and _proc(pid) is not None


def tty_of(pid: int) -> str:
    """The terminal a process is attached to ("" when it has none, like one spawned by Remote Control)."""
    proc = _proc(pid)
    return "" if not proc or proc[1] in ("??", "-", "") else proc[1]


def under_remote_control(pid: int) -> bool:
    """True when `claude remote-control` spawned this process: a session started from the Claude app."""
    return any("remote-control" in command for _, _, command in ancestors(pid)[1:])


def started_at(pid: int) -> float | None:
    """When the process started (unix time), from its elapsed time; None when it is gone."""
    out = subprocess.run(["ps", "-o", "etime=", "-p", str(pid)], capture_output=True, text=True).stdout.strip()
    if not out:
        return None
    days, _, clock = out.rpartition("-")
    parts = [int(p) for p in clock.split(":")]
    while len(parts) < 3:
        parts.insert(0, 0)
    hours, minutes, seconds = parts
    return time.time() - (int(days or 0) * 86400 + hours * 3600 + minutes * 60 + seconds)
