"""Builds the `claude` command line, MCP config and hook settings for each session. Open this to see exact flags."""

from __future__ import annotations

import json
import shlex
import shutil
import sys
import uuid
from pathlib import Path

from .config import Config
from .paths import ProjectPaths

DISALLOWED_TOOLS = ["SendMessage", "ListAgents"]
MANAGER_EDIT_TOOLS = ["Edit", "Write", "MultiEdit", "NotebookEdit"]


def claude_bin() -> str:
    return shutil.which("claude") or "claude"


def supermanager_argv() -> list[str]:
    """Absolute way to invoke ourselves from hooks and MCP config, even in a fresh shell."""
    exe = shutil.which("supermanager")
    if exe:
        return [exe]
    return [sys.executable, "-m", "supermanager"]


def new_session_id() -> str:
    return str(uuid.uuid4())


def _hook(cmd_args: list[str]) -> dict:
    return {"type": "command", "command": shlex.join([*supermanager_argv(), *cmd_args])}


def write_session_files(
    paths: ProjectPaths, role: str, task_id: str | None, system_prompt: str
) -> tuple[Path, Path, Path]:
    """Write mcp.json, settings.json and prompt.md for a session; returns their paths."""
    folder = paths.agent_dir(task_id) if task_id else paths.home / "manager"
    folder.mkdir(parents=True, exist_ok=True)

    mcp_args = ["mcp", "--role", role, "--project", str(paths.root)]
    hook_base = ["hook", "--project", str(paths.root)]
    if task_id:
        mcp_args += ["--task", task_id]
        hook_base += ["--task", task_id]

    mcp = {"mcpServers": {"supermanager": {"command": supermanager_argv()[0],
                                            "args": [*supermanager_argv()[1:], *mcp_args]}}}
    hooks: dict[str, list] = {
        "SessionEnd": [{"hooks": [_hook([*hook_base, "session-end"])]}],
        "Stop": [{"hooks": [_hook([*hook_base, "idle"])]}],
        "UserPromptSubmit": [{"hooks": [_hook([*hook_base, "busy"])]}],
        "Notification": [{"hooks": [_hook([*hook_base, "notification"])]}],
    }
    if role == "agent":
        hooks["PostToolUse"] = [{"matcher": "ExitPlanMode", "hooks": [_hook([*hook_base, "plan-approved"])]}]
    settings = {"hooks": hooks}

    mcp_path, settings_path, prompt_path = folder / "mcp.json", folder / "settings.json", folder / "prompt.md"
    mcp_path.write_text(json.dumps(mcp, indent=2))
    settings_path.write_text(json.dumps(settings, indent=2))
    prompt_path.write_text(system_prompt)
    return mcp_path, settings_path, prompt_path


def manager_argv(
    config: Config, paths: ProjectPaths, session_id: str, kickoff: str, resume: bool, system_prompt: str
) -> list[str]:
    mcp_path, settings_path, _ = write_session_files(paths, "manager", None, system_prompt)
    name = f"{config.project_name}-manager"
    argv = [claude_bin()]
    if not resume:
        argv.append(kickoff)
    argv += [
        "--name", name,
        "--remote-control", config.manager_rc_name(),
        "--dangerously-skip-permissions",
        "--mcp-config", str(mcp_path),
        "--settings", str(settings_path),
        "--append-system-prompt", system_prompt,
        "--disallowedTools", *DISALLOWED_TOOLS, *([] if config.manager.can_edit_files else MANAGER_EDIT_TOOLS),
    ]
    argv += ["--resume", session_id] if resume else ["--session-id", session_id]
    if config.manager.model:
        argv += ["--model", config.manager.model]
    argv += config.manager.extra_args
    return argv


def agent_argv(
    config: Config, paths: ProjectPaths, task_id: str, session_id: str, kickoff: str, resume: bool, system_prompt: str
) -> list[str]:
    mcp_path, settings_path, _ = write_session_files(paths, "agent", task_id, system_prompt)
    argv = [claude_bin()]
    if not resume:
        argv.append(kickoff)
    argv += [
        "--name", f"{config.project_name}/{task_id}",
        "--remote-control", config.agent_rc_name(task_id),
        "--permission-mode", "plan",
        "--mcp-config", str(mcp_path),
        "--settings", str(settings_path),
        "--append-system-prompt", system_prompt,
        "--disallowedTools", *DISALLOWED_TOOLS,
    ]
    argv += ["--resume", session_id] if resume else ["--session-id", session_id]
    if config.agents.allow_skip_permissions:
        argv.append("--allow-dangerously-skip-permissions")
    if config.agents.model:
        argv += ["--model", config.agents.model]
    argv += config.agents.extra_args
    return argv


def session_env(paths: ProjectPaths, task_id: str | None) -> dict[str, str]:
    env = {"SUPERMANAGER_PROJECT": str(paths.root), "SUPERMANAGER_SOCKET": str(paths.socket)}
    if task_id:
        env["SUPERMANAGER_TASK"] = task_id
    return env
