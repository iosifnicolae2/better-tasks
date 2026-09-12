"""Tiny synchronous client for the daemon socket, used by the MCP bridge, hooks and CLI subcommands."""

from __future__ import annotations

import itertools
import json
import socket
from pathlib import Path
from typing import Any


class DaemonUnavailable(RuntimeError):
    pass


class DaemonError(RuntimeError):
    """The daemon answered, but with an error message meant for the caller."""


class DaemonClient:
    _ids = itertools.count(1)

    def __init__(self, socket_path: Path):
        self.socket_path = Path(socket_path)

    def call(self, op: str, timeout: float = 30.0, **args: Any) -> Any:
        req = {"id": next(self._ids), "op": op, "args": args}
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
                s.settimeout(timeout)
                s.connect(str(self.socket_path))
                s.sendall((json.dumps(req) + "\n").encode())
                buf = b""
                while not buf.endswith(b"\n"):
                    chunk = s.recv(65536)
                    if not chunk:
                        break
                    buf += chunk
        except (FileNotFoundError, ConnectionRefusedError, socket.timeout, OSError) as exc:
            raise DaemonUnavailable(
                f"supermanager is not running for this project (socket {self.socket_path}): {exc}. "
                "Start it with `supermanager up`."
            ) from exc
        if not buf:
            raise DaemonUnavailable("daemon closed the connection without answering")
        reply = json.loads(buf)
        if not reply.get("ok"):
            raise DaemonError(reply.get("error", "unknown error"))
        return reply.get("result")
