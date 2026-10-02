"""Builds the `claude` / `codex` command line, MCP config and hook settings for each session. Open this to see exact flags.

Claude gets hooks and MCP through files passed with --settings / --mcp-config. Codex reads hooks only from
`<cwd>/.codex/hooks.json` (same JSON shape as Claude's) and takes MCP servers and instructions as `-c` overrides.
"""

from __future__ import annotations

import json
import shlex
import shutil
import subprocess
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path

from .config import EFFORT_LEVELS, Config, skips_permissions
from .paths import ProjectPaths

DISALLOWED_TOOLS = ["SendMessage", "ListAgents"]
MANAGER_EDIT_TOOLS = ["Edit", "Write", "MultiEdit", "NotebookEdit"]
# A planner reads and asks; it has no worktree, so it must not be able to change anything, and its plan goes
# onto the task with update_plan instead of through the plan-mode dialog.
PLANNER_DISALLOWED = [*DISALLOWED_TOOLS, *MANAGER_EDIT_TOOLS, "ExitPlanMode"]
CODEX_HOOKS_FILE = Path(".codex") / "hooks.json"
OUR_TOOLS = "mcp__supermanager"   # supermanager's own MCP tools: always allowed, whatever else is asked about
PROJECT_SETTINGS_FILE = Path(".claude") / "settings.local.json"   # per-user project settings: never committed


def claude_bin() -> str:
    return shutil.which("claude") or "claude"


def codex_bin() -> str:
    return shutil.which("codex") or "codex"


def supermanager_argv(portable: bool = False) -> list[str]:
    """How a session calls us back (hooks, MCP bridge).

    `portable` writes the bare command when it is on PATH, so the files we generate carry no path from this
    machine — a teammate who clones the project and runs their own supermanager gets the same files."""
    exe = shutil.which("supermanager")
    if exe:
        return ["supermanager"] if portable else [exe]
    return [sys.executable, "-m", "supermanager"]


def new_session_id() -> str:
    return str(uuid.uuid4())


def _hook(cmd_args: list[str]) -> dict:
    return {"type": "command", "command": shlex.join([*supermanager_argv(portable=True), *cmd_args])}


def _hooks(role: str, task_id: str | None, tool: str, root: Path) -> dict[str, list]:
    """The lifecycle hooks that let the daemon follow a session. Same JSON shape for Claude and Codex.

    The commands name no project and no task: every session runs with SUPERMANAGER_PROJECT and SUPERMANAGER_TASK
    in its environment (see session_env), so these files hold nothing specific to this machine."""
    base = ["hook"]
    hooks: dict[str, list] = {
        "SessionEnd": [{"hooks": [_hook([*base, "session-end"])]}],
        "Stop": [{"hooks": [_hook([*base, "idle"])]}],
        "UserPromptSubmit": [{"hooks": [_hook([*base, "busy"])]}],
    }
    if tool == "claude":
        hooks["Notification"] = [{"hooks": [_hook([*base, "notification"])]}]
        if role == "agent":
            hooks["PostToolUse"] = [{"matcher": "ExitPlanMode", "hooks": [_hook([*base, "plan-approved"])]}]
    else:
        hooks["PermissionRequest"] = [{"hooks": [_hook([*base, "permission"])]}]
    return hooks


def write_session_files(
    paths: ProjectPaths, role: str, task_id: str | None, system_prompt: str, tool: str = "claude"
) -> tuple[Path, Path, Path]:
    """Write mcp.json, settings.json and prompt.md for a session; returns their paths."""
    folder = paths.agent_dir(task_id) if task_id else paths.home / "manager"
    if role == "plan":
        folder = folder / "plan"
    folder.mkdir(parents=True, exist_ok=True)

    # The task id belongs on the command line: it is not a path, and a tool that scrubs the environment for its
    # MCP servers (Codex does) would otherwise leave the bridge without one. The project is not named here;
    # the bridge finds it from the session's environment, or from git when it only has a worktree.
    argv = supermanager_argv(portable=True)
    mcp_args = [*argv[1:], "mcp", "--role", role, "--tool", tool] + (["--task", task_id] if task_id else [])
    mcp = {"mcpServers": {"supermanager": {"command": argv[0], "args": mcp_args}}}
    settings = {"hooks": _hooks(role, task_id, tool, paths.root),
                "permissions": {"allow": [OUR_TOOLS]}}   # talking to supermanager never needs a yes

    mcp_path, settings_path, prompt_path = folder / "mcp.json", folder / "settings.json", folder / "prompt.md"
    mcp_path.write_text(json.dumps(mcp, indent=2))
    settings_path.write_text(json.dumps(settings, indent=2))
    prompt_path.write_text(system_prompt)
    return mcp_path, settings_path, prompt_path


def remote_argv(config: Config, spawn: str = "") -> list[str]:
    """`claude remote-control`: a server that lets you start sessions in this project from claude.ai/code or the
    Claude app. The sessions it spawns are its own — supermanager sees them through the project hooks."""
    argv = [claude_bin(), "remote-control",
            "--name", config.remote_name(),
            "--spawn", spawn or config.remote.spawn,
            "--capacity", str(max(1, config.remote.capacity))]
    if skips_permissions(config):   # the sessions it spawns run like our own agents: nothing stops to ask
        argv += ["--permission-mode", "bypassPermissions"]
    return argv


def write_project_hooks(paths: ProjectPaths) -> Path:
    """Put our lifecycle hooks into `<project>/.claude/settings.local.json`, so a Claude session someone starts
    in this project — from the phone through Remote Control, or by hand in a terminal — reports to supermanager
    and shows up on the agents page. Whatever else is in that file is kept, and git never sees it."""
    path = paths.root / PROJECT_SETTINGS_FILE
    settings = _read_json(path)
    hooks = {k: [e for e in v if not _is_ours(e)] for k, v in (settings.get("hooks") or {}).items()}
    for event, entries in _hooks("session", None, "claude", paths.root).items():
        hooks[event] = [*hooks.get(event, []), *entries]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({**settings, "hooks": {k: v for k, v in hooks.items() if v}}, indent=2))
    _git_exclude(paths.root, str(PROJECT_SETTINGS_FILE))
    return path


def remove_project_hooks(paths: ProjectPaths) -> None:
    """Take our hooks back out of the project's settings (remote.adopt off), leaving anything else in place."""
    path = paths.root / PROJECT_SETTINGS_FILE
    settings = _read_json(path)
    if not settings.get("hooks"):
        return
    hooks = {k: [e for e in v if not _is_ours(e)] for k, v in settings["hooks"].items()}
    rest = {**settings, "hooks": {k: v for k, v in hooks.items() if v}}
    if not rest["hooks"]:
        rest.pop("hooks")
    path.write_text(json.dumps(rest, indent=2)) if rest else path.unlink()


def _read_json(path: Path) -> dict:
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return {}


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
    argv += _model_args("claude", config.manager.model, config.manager.effort)
    argv += config.manager.extra_args
    return argv


@dataclass(frozen=True)
class AgentSettings:
    """What one agent session runs with (task overrides already applied to the config defaults)."""
    tool: str = "claude"
    model: str = ""
    effort: str = ""

    def validate(self) -> None:
        if self.tool not in EFFORT_LEVELS:
            raise ValueError(f"tool must be one of {', '.join(EFFORT_LEVELS)}, not '{self.tool}'")
        levels = EFFORT_LEVELS[self.tool]
        if self.effort and self.effort not in levels:
            raise ValueError(f"effort for {self.tool} must be one of {', '.join(levels)}, not '{self.effort}'")

    def label(self) -> str:
        return " ".join(part for part in (self.tool, self.model, self.effort) if part)


def _model_args(tool: str, model: str, effort: str) -> list[str]:
    if tool == "codex":
        return ([*(["-m", model] if model else [])]
                + (["-c", f"model_reasoning_effort={_toml(effort)}"] if effort else []))
    return (["--model", model] if model else []) + (["--effort", effort] if effort else [])


def _toml(value: str | list[str]) -> str:
    """A TOML literal for a `codex -c key=value` override. JSON strings are valid TOML basic strings."""
    if isinstance(value, list):
        return "[" + ", ".join(json.dumps(v) for v in value) + "]"
    return json.dumps(value)


def _permission_args(skip: bool, plan_mode: bool) -> list[str]:
    """How much a Claude agent may do on its own: everything, asked about nothing (agents.skip_permissions, the
    default); plan mode, where it plans and you approve before anything changes; or acceptEdits, which is what
    is left — an approved plan, auto.plan, or a project with no planning step at all."""
    if skip:
        return ["--dangerously-skip-permissions"]
    if plan_mode:
        return ["--permission-mode", "plan"]
    return ["--permission-mode", "acceptEdits"]


def planner_argv(
    config: Config, paths: ProjectPaths, task_id: str, cwd: Path, settings: AgentSettings,
    session_id: str, kickoff: str, resume: bool, system_prompt: str,
) -> list[str]:
    """The planning session: it reads the project, asks the user what is unclear, and writes the plan onto the
    task. It runs in the project itself with no worktree, so nothing it could do may change a file."""
    if settings.tool == "codex":
        return _codex_argv(config, paths, task_id, cwd, settings, session_id, kickoff, resume, system_prompt,
                           mcp=True, read_only=True, role="plan")
    mcp_path, settings_path, _ = write_session_files(paths, "plan", task_id, system_prompt)
    argv = [claude_bin()]
    if not resume:
        argv.append(kickoff)
    argv += [
        "--name", f"{config.project_name}/{task_id} plan",
        "--remote-control", config.agent_rc_name(task_id) + "-plan",
        "--dangerously-skip-permissions",   # it cannot edit: every editing tool is disallowed below
        "--mcp-config", str(mcp_path),
        "--settings", str(settings_path),
        "--append-system-prompt", system_prompt,
        "--allowedTools", OUR_TOOLS,
        "--disallowedTools", *PLANNER_DISALLOWED,
    ]
    argv += ["--resume", session_id] if resume else ["--session-id", session_id]
    argv += _model_args("claude", settings.model, settings.effort)
    argv += config.agents.extra_args
    return argv


def agent_argv(
    config: Config, paths: ProjectPaths, task_id: str, cwd: Path, settings: AgentSettings,
    session_id: str, kickoff: str, resume: bool, system_prompt: str,
    plan_mode: bool = False, skip: bool = True,
) -> list[str]:
    """The session that does the work. `plan_mode` says it really starts in plan mode and waits for an
    approval, `skip` that it runs with every permission granted (config.skips_permissions)."""
    if settings.tool == "codex":
        return _codex_argv(config, paths, task_id, cwd, settings, session_id, kickoff, resume, system_prompt,
                           mcp=True, auto_permissions=skip)
    mcp_path, settings_path, _ = write_session_files(paths, "agent", task_id, system_prompt)
    argv = [claude_bin()]
    if not resume:
        argv.append(kickoff)
    argv += [
        "--name", f"{config.project_name}/{task_id}",
        "--remote-control", config.agent_rc_name(task_id),
        *_permission_args(skip, plan_mode),
        "--mcp-config", str(mcp_path),
        "--settings", str(settings_path),
        "--append-system-prompt", system_prompt,
        "--allowedTools", OUR_TOOLS,
        "--disallowedTools", *DISALLOWED_TOOLS,
    ]
    argv += ["--resume", session_id] if resume else ["--session-id", session_id]
    if config.agents.allow_skip_permissions and not skip:
        argv.append("--allow-dangerously-skip-permissions")   # already skipped: the flag would only clash
    argv += _model_args("claude", settings.model, settings.effort)
    argv += config.agents.extra_args
    return argv


def free_agent_argv(config: Config, paths: ProjectPaths, agent_id: str, settings: AgentSettings, session_id: str,
                    skip: bool = True) -> list[str]:
    """A plain session in the project root: no task, no plan mode, no supermanager tools; only the hooks
    that let the daemon follow it (busy / idle / bell / ended)."""
    if settings.tool == "codex":
        return _codex_argv(config, paths, agent_id, paths.root, settings, session_id, "", False, "", mcp=False,
                           auto_permissions=skip)
    _, settings_path, _ = write_session_files(paths, "agent", agent_id, "")
    argv = [
        claude_bin(),
        "--name", f"{config.project_name}/{agent_id}",
        "--remote-control", config.agent_rc_name(agent_id),
        "--settings", str(settings_path),
        "--disallowedTools", *DISALLOWED_TOOLS,
        "--session-id", session_id,
    ]
    if skip:
        argv.append("--dangerously-skip-permissions")
    elif config.agents.allow_skip_permissions:
        argv.append("--allow-dangerously-skip-permissions")
    argv += _model_args("claude", settings.model, settings.effort)
    argv += config.agents.extra_args
    return argv


def _codex_argv(
    config: Config, paths: ProjectPaths, agent_id: str, cwd: Path, settings: AgentSettings,
    session_id: str, kickoff: str, resume: bool, system_prompt: str, mcp: bool,
    auto_permissions: bool = False, read_only: bool = False, role: str = "agent",
) -> list[str]:
    """`codex` in the agent's folder. Its session id is only known once its first hook reports it, so a fresh
    session starts without one and `resume` uses the id the hooks gave us."""
    write_codex_hooks(paths, agent_id, cwd)
    argv = [codex_bin()]
    if resume:
        argv += ["resume", session_id]
    elif kickoff:
        argv.append(kickoff)
    argv += ["--dangerously-bypass-hook-trust", "-C", str(cwd)]   # our hooks.json is ours; no review prompt
    if read_only:          # a planner: it may look at anything and change nothing
        argv += ["-a", "never", "-s", "read-only"]
    elif auto_permissions:  # the same as Claude's --dangerously-skip-permissions: no approvals, no sandbox
        argv.append("--dangerously-bypass-approvals-and-sandbox")
    if system_prompt:
        argv += ["-c", f"developer_instructions={_toml(system_prompt)}"]
    if mcp:
        exe, *rest = supermanager_argv(portable=True)
        mcp_args = [*rest, "mcp", "--role", role, "--tool", "codex", "--task", agent_id]
        argv += ["-c", f"mcp_servers.supermanager.command={_toml(exe)}",
                 "-c", f"mcp_servers.supermanager.args={_toml(mcp_args)}",
                 "-c", 'mcp_servers.supermanager.default_tools_approval_mode="approve"']   # our tools: no prompts
    argv += _model_args("codex", settings.model, settings.effort)
    argv += config.agents.codex_extra_args
    return argv


def write_codex_hooks(paths: ProjectPaths, agent_id: str, cwd: Path) -> Path:
    """Put our hooks into `<cwd>/.codex/hooks.json`, keeping any hooks the project already has there,
    and hide the file from git so an agent does not commit it."""
    path = cwd / CODEX_HOOKS_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = _read_json(path)
    hooks = {k: [e for e in v if not _is_ours(e)] for k, v in (existing.get("hooks") or {}).items()}
    for event, entries in _hooks("agent", agent_id, "codex", paths.root).items():
        hooks[event] = [*hooks.get(event, []), *entries]
    path.write_text(json.dumps({**existing, "hooks": hooks}, indent=2))
    _git_exclude(cwd, str(CODEX_HOOKS_FILE))
    return path


def _is_ours(entry: dict) -> bool:
    return any("supermanager" in h.get("command", "") and " hook " in h.get("command", "")
               for h in entry.get("hooks", []))


def _git_exclude(cwd: Path, pattern: str) -> None:
    """Add a pattern to the repo's private ignore list (.git/info/exclude, shared by all its worktrees)."""
    proc = subprocess.run(["git", "-C", str(cwd), "rev-parse", "--git-common-dir"], capture_output=True, text=True)
    if proc.returncode != 0:
        return
    common = Path(proc.stdout.strip())
    exclude = (common if common.is_absolute() else cwd / common) / "info" / "exclude"
    lines = exclude.read_text().splitlines() if exclude.is_file() else []
    if pattern not in lines:
        exclude.parent.mkdir(parents=True, exist_ok=True)
        exclude.write_text("\n".join([*lines, pattern]) + "\n")


def session_env(paths: ProjectPaths, task_id: str | None, role: str = "") -> dict[str, str]:
    """What a session's window carries: which project it belongs to, which task it is for, and what it is. The
    hooks and the MCP bridge read these instead of having the paths written into their config files.

    A window's environment is inherited by what it starts, which is the point for the Remote Control server:
    every session it spawns carries SUPERMANAGER_ROLE=session, so its hooks land here as a session of ours."""
    env = {"SUPERMANAGER_PROJECT": str(paths.root), "SUPERMANAGER_SOCKET": str(paths.socket)}
    if task_id:
        env["SUPERMANAGER_TASK"] = task_id
    if role:
        env["SUPERMANAGER_ROLE"] = role
    return env
