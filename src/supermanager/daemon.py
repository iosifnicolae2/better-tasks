"""Unix-socket JSON-lines server that exposes the Orchestrator to MCP bridges, hooks and the CLI.

Protocol: one JSON object per line. Request {"id", "op", "args"} -> reply {"id", "ok", "result" | "error"}.
"""

from __future__ import annotations

import asyncio
import json
import os
from dataclasses import asdict, is_dataclass
from typing import Any

from .orchestrator import Orchestrator, OrchestratorError


def _plain(value: Any) -> Any:
    if is_dataclass(value) and not isinstance(value, type):
        return asdict(value)
    if isinstance(value, list):
        return [_plain(v) for v in value]
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    return value


class Daemon:
    def __init__(self, orch: Orchestrator):
        self.orch = orch
        self.server: asyncio.AbstractServer | None = None
        self.ops = {
            "ping": lambda: {"pong": True},
            "hello": self.orch.hello,
            "get_status": self.orch.status,
            "list_tasks": self.orch.list_tasks,
            "get_task": self.orch._task,
            "create_task": self.orch.create_task,
            "create_task_from_template": self.orch.create_task_from_template,
            "events_since": self.orch.events_since,
            "update_task": self._update_task,
            "reorder_backlog": self.orch.reorder_backlog,
            "move_task": self.orch.move_task,
            "cancel_task": self.orch.cancel_task,
            "delete_task": self.orch.delete_task,
            "requeue_task": self.orch.requeue_task,
            "spawn_agent": self.orch.spawn_agent,
            "spawn_free_agent": self.orch.spawn_free_agent,
            "stop_free_agent": self.orch.stop_free_agent,
            "list_agents": self.orch.list_agents,
            "close_task": self.orch.close_task,
            "ask_manager_to_start": self.orch.ask_manager_to_start,
            "tell_manager": self.orch.tell_manager,
            "stop_agent": self.orch.stop_agent,
            "close_agent_session": self.orch.close_agent_session,
            "remove_worktree": self.orch.remove_worktree,
            "clean_worktrees": self.orch.clean_worktrees,
            "report_progress": self.orch.report_progress,
            "update_plan": self.orch.update_plan,
            "record_request": self.orch.record_request,
            "add_context": self.orch.add_context,
            "block_task": self.orch.block_task,
            "complete_task": self.orch.complete_task,
            "merge_task": self.orch.merge_task,
            "plan_approved": self.orch.plan_approved,
            "get_events": self.orch.drain_events,
            "set_config": self.orch.set_config,
            "get_config": self.orch.get_config,
            "start_manager": self.orch.start_manager,
            "stop_manager": self.orch.stop_manager,
            "hook": self.orch.handle_hook,
            "acknowledge": self.orch.acknowledge,
            "pause_session": self.orch.pause_session,
            "screen": self.orch.screen,
            "message_agent": self.orch.message_agent,
            "read_agent": self.orch.read_agent,
            "search_sessions": self.orch.search_sessions,
            "quit_all": self.orch.request_exit,
        }

    def _update_task(self, task_id: str, fields: dict[str, Any]):
        return self.orch.update_task(task_id, **fields)

    async def start(self) -> None:
        path = self.orch.paths.socket
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            path.unlink()
        self.server = await asyncio.start_unix_server(self._handle, path=str(path))
        os.chmod(path, 0o600)

    async def stop(self) -> None:
        if self.server:
            self.server.close()
            await self.server.wait_closed()
        try:
            self.orch.paths.socket.unlink()
        except FileNotFoundError:
            pass

    async def _handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            while line := await reader.readline():
                reply = await self._dispatch(line)
                writer.write((json.dumps(reply) + "\n").encode())
                await writer.drain()
        except (ConnectionResetError, BrokenPipeError, asyncio.IncompleteReadError):
            pass
        finally:
            writer.close()

    async def _dispatch(self, line: bytes) -> dict[str, Any]:
        try:
            req = json.loads(line)
        except json.JSONDecodeError as exc:
            return {"id": None, "ok": False, "error": f"bad json: {exc}"}
        rid, op, args = req.get("id"), req.get("op"), req.get("args") or {}
        fn = self.ops.get(op)
        if not fn:
            return {"id": rid, "ok": False, "error": f"unknown op '{op}'"}
        try:
            result = await asyncio.to_thread(fn, **args)
            return {"id": rid, "ok": True, "result": _plain(result)}
        except OrchestratorError as exc:
            return {"id": rid, "ok": False, "error": str(exc)}
        except TypeError as exc:
            return {"id": rid, "ok": False, "error": f"bad arguments for {op}: {exc}"}
        except Exception as exc:  # keep the daemon alive no matter what
            return {"id": rid, "ok": False, "error": f"{type(exc).__name__}: {exc}"}


def is_daemon_running(socket_path) -> bool:
    from .client import DaemonClient, DaemonUnavailable
    try:
        DaemonClient(socket_path).call("ping", timeout=1.0)
        return True
    except DaemonUnavailable:
        return False
