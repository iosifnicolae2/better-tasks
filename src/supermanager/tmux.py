"""Thin tmux wrapper: one tmux session per project, one window per Claude session, a minimal status bar.

Everything runs on supermanager's own tmux server (socket name `supermanager`), so nothing here touches the
user's tmux config, bindings or sessions. The only key tmux keeps for itself is ctrl+a.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

SERVER = "supermanager"        # `tmux -L supermanager`: a private server, separate from the user's own tmux
DASHBOARD_WINDOW = "admin"
MANAGER_WINDOW = "manager"
KEY = "ctrl+a"                 # admin ⇄ manager. Every other key goes straight to Claude.

# Server-wide settings developers expect from a well-configured tmux.
SERVER_OPTIONS = (
    ("escape-time", "10"),                    # no half-second pause after Esc (vim, Claude's own key handling)
    ("focus-events", "on"),                   # apps learn when their window gets focus
    ("default-terminal", "tmux-256color"),
    ("terminal-overrides", ",*:RGB"),         # true colour
    ("extended-keys", "on"),                  # modified keys like ctrl+shift+… reach Claude intact
)


class TmuxError(RuntimeError):
    pass


def tmux_argv(*args: str) -> list[str]:
    return ["tmux", "-L", SERVER, *args]


def inside_tmux_session(session: str) -> bool:
    """True when this process runs inside the given supermanager session (so we can switch windows in place)."""
    if not os.environ.get("TMUX"):
        return False
    proc = subprocess.run(tmux_argv("display-message", "-p", "#{session_name}"), capture_output=True, text=True)
    return proc.stdout.strip() == session


class Tmux:
    def __init__(self, session: str):
        self.session = session

    @staticmethod
    def available() -> bool:
        return shutil.which("tmux") is not None

    def _run(self, *args: str, check: bool = True) -> subprocess.CompletedProcess:
        proc = subprocess.run(tmux_argv(*args), capture_output=True, text=True)
        if check and proc.returncode != 0:
            raise TmuxError(proc.stderr.strip() or f"tmux {' '.join(args)} failed")
        return proc

    # ---------------------------------------------------------------- session
    def session_exists(self) -> bool:
        return self._run("has-session", "-t", f"={self.session}", check=False).returncode == 0

    def ensure_session(self, cwd: Path, first_window: str = "supermanager", argv: list[str] | None = None) -> None:
        """Create the project session if needed. The first window runs argv (or a shell)."""
        if self.session_exists():
            self._style()   # re-apply keys and bar: an older run may have set different ones
            return
        cmd = ["new-session", "-d", "-s", self.session, "-n", first_window, "-c", str(cwd), "-x", "200", "-y", "50"]
        if argv:
            cmd += [*_clean_env_prefix(), *argv]
        self._run(*cmd)
        self._style()

    def _style(self) -> None:
        """Bar with only the window names, terminal title, sane developer defaults, and the ctrl+a key."""
        s = self.session
        project = s.removeprefix("sm-")
        for key, value in SERVER_OPTIONS:
            self._run("set-option", "-s", key, value, check=False)
        opts = {
            "status": "on", "status-position": "bottom", "status-interval": "2",
            "status-style": "bg=colour236,fg=colour250",
            "status-left-length": "40",
            "status-left": f"#[bold,fg=colour81] {project} #[fg=colour240]│ ",
            "status-right": "",
            "window-status-separator": "",
            "base-index": "1",
            "renumber-windows": "on",   # windows keep 1, 2, 3… when one in the middle closes
            "history-limit": "50000",
            "set-titles": "on",         # the terminal tab/window title follows the session you are in
            "set-titles-string": f"{project} · #W · #T",
            "prefix": "None",           # no prefix key: Claude gets every key except ctrl+a
            "mouse": "on",              # wheel scrolls a session's output; click a window name in the bar to switch
            "bell-action": "any",       # a bell in any window reaches your terminal (sound / dock bounce)
            "visual-bell": "off",
        }
        for key, value in opts.items():
            self._run("set-option", "-t", s, key, value, check=False)
        for window in self._window_ids():
            self._window_options(window)
        self._run("move-window", "-r", "-s", s, check=False)   # number the windows 1, 2, 3… from the start
        self._bind_switch_key()

    def _bind_switch_key(self) -> None:
        """ctrl+a: from any session go to the admin; from the admin go to the manager."""
        in_admin = f"#{{==:#{{window_name}},{DASHBOARD_WINDOW}}}"
        self._run("bind-key", "-n", "C-a", "if-shell", "-F", in_admin,
                  f"select-window -t {MANAGER_WINDOW}", f"select-window -t {DASHBOARD_WINDOW}", check=False)

    WINDOW_OPTIONS = (
        ("remain-on-exit", "on"), ("automatic-rename", "off"), ("allow-rename", "off"),
        ("monitor-bell", "on"),
        ("window-status-format", " #I #{?window_bell_flag,🔔 ,}#W "),
        ("window-status-current-format", "#[bold,bg=colour81,fg=colour232] #I #{?window_bell_flag,🔔 ,}#W "),
        ("window-status-bell-style", "bold,bg=colour214,fg=colour232"),
    )

    def _window_options(self, target: str) -> None:
        """Window-scoped options must be set on every window; a session-level set only reaches the current one."""
        for key, value in self.WINDOW_OPTIONS:
            self._run("set-option", "-w", "-t", target, key, value, check=False)

    # ---------------------------------------------------------------- windows
    def new_window(self, name: str, cwd: Path, argv: list[str], env: dict[str, str], first: bool = False) -> str:
        """Start argv in a new window and return its stable window id (like '@7').

        Windows are ordered manager, agents…, admin: new ones go right before the admin, `first` ones at the front.
        """
        env_prefix = _clean_env_prefix() + [f"{k}={v}" for k, v in env.items()]
        place: list[str] = []
        admin = self.find_window(DASHBOARD_WINDOW)
        if first and (ids := self._window_ids()):
            place = ["-b", "-t", ids[0]]
        elif admin and name != DASHBOARD_WINDOW:
            place = ["-b", "-t", admin]
        else:
            place = ["-t", self.session]
        proc = self._run(
            "new-window", "-d", "-P", "-F", "#{window_id}",
            *place, "-n", name, "-c", str(cwd),
            *env_prefix, *argv,
        )
        window_id = proc.stdout.strip()
        self._window_options(window_id)
        return window_id

    def _window_ids(self) -> list[str]:
        proc = self._run("list-windows", "-t", self.session, "-F", "#{window_id}", check=False)
        return proc.stdout.split() if proc.returncode == 0 else []

    def find_window(self, name: str) -> str | None:
        proc = self._run("list-windows", "-t", self.session, "-F", "#{window_id} #{window_name}", check=False)
        for line in proc.stdout.splitlines():
            wid, _, wname = line.partition(" ")
            if wname == name:
                return wid
        return None

    def window_exists(self, window_id: str) -> bool:
        return window_id in self._window_ids()

    def window_alive(self, window_id: str) -> bool:
        if not self.window_exists(window_id):
            return False
        proc = self._run("display-message", "-p", "-t", window_id, "#{pane_dead}", check=False)
        return proc.returncode == 0 and proc.stdout.strip() == "0"

    def dead_status(self, window_id: str) -> int | None:
        """Exit status of a finished window's program, or None while it still runs (or the window is gone)."""
        proc = self._run("display-message", "-p", "-t", window_id, "#{pane_dead} #{pane_dead_status}", check=False)
        dead, _, status = proc.stdout.strip().partition(" ")
        if proc.returncode != 0 or dead != "1":
            return None
        return int(status) if status.isdigit() else 0

    def send_text(self, window_id: str, text: str) -> None:
        """Type one line into the window and press Enter (this is how we talk to a Claude session)."""
        self._run("send-keys", "-t", window_id, "-l", text)
        self._run("send-keys", "-t", window_id, "Enter")

    def send_keys(self, window_id: str, *keys: str) -> None:
        for key in keys:
            self._run("send-keys", "-t", window_id, key, check=False)

    def ring(self, window_id: str) -> None:
        """Ring the bell in a window: tmux marks it 🔔 in the bar (until you visit it) and beeps your terminal."""
        proc = self._run("display-message", "-p", "-t", window_id, "#{pane_tty}", check=False)
        tty = proc.stdout.strip()
        if proc.returncode != 0 or not tty.startswith("/dev/"):
            return
        try:
            with open(tty, "w") as pane:
                pane.write("\a")
        except OSError:
            pass

    def capture(self, window_id: str, lines: int = 40) -> str:
        proc = self._run("capture-pane", "-p", "-t", window_id, "-S", f"-{lines}", check=False)
        return proc.stdout.rstrip() if proc.returncode == 0 else ""

    def kill_window(self, window_id: str) -> None:
        self._run("kill-window", "-t", window_id, check=False)

    def select_window(self, window_id: str) -> None:
        self._run("select-window", "-t", window_id, check=False)

    def detach(self) -> None:
        self._run("detach-client", "-s", self.session, check=False)

    def attach_argv(self, window_id: str | None = None) -> list[str]:
        if window_id:
            self.select_window(window_id)
        return tmux_argv("attach-session", "-t", self.session)


def _clean_env_prefix() -> list[str]:
    """Claude refuses to start inside another Claude session; strip those markers from the child env."""
    return ["env", "-u", "CLAUDECODE", "-u", "CLAUDE_CODE_ENTRYPOINT"]
