"""Thin tmux wrapper: one tmux session per project, one window per Claude session, a minimal status bar.

Everything runs on supermanager's own tmux server (socket name `supermanager`), so nothing here touches the
user's tmux config, bindings or sessions. The only key tmux keeps for itself is ctrl+a (next page).
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

SERVER = "supermanager"        # `tmux -L supermanager`: a private server, separate from the user's own tmux
DASHBOARD_WINDOW = "tasks"     # supermanager's own pages come last in the bar: tasks, agents, config
AGENTS_WINDOW = "agents"
CONFIG_WINDOW = "config"
MANAGER_WINDOW = "manager"
PAGE_WINDOWS = (DASHBOARD_WINDOW, AGENTS_WINDOW, CONFIG_WINDOW)
PAGE_CYCLE = (MANAGER_WINDOW, DASHBOARD_WINDOW, AGENTS_WINDOW, CONFIG_WINDOW)   # ctrl+a / ← → order
KEY = "ctrl+a"                 # manager ⇄ tasks page. Every other key goes straight to Claude.

# Server-wide settings developers expect from a well-configured tmux.
SERVER_OPTIONS = (
    ("escape-time", "10"),                    # no half-second pause after Esc (vim, Claude's own key handling)
    ("focus-events", "on"),                   # apps learn when their window gets focus
    ("default-terminal", "tmux-256color"),
    ("terminal-overrides", ",*:RGB"),         # true colour
    ("extended-keys", "on"),                  # modified keys like ctrl+shift+… reach Claude intact
)


# The bar is built by hand instead of by tmux's own window list: tmux renders a hidden window (every agent) as
# one blank space, which left a gap between the page names. This loop simply skips windows whose format is empty.
STATUS_LEFT = ("#[align=left range=left #{E:status-left-style}]#[push-default]"
               "#{T;=/#{status-left-length}:status-left}#[pop-default]#[norange default]")
IS_PAGE = "#{m/r:^(" + "|".join((MANAGER_WINDOW, *PAGE_WINDOWS)) + ")$,#{window_name}}"
_TAB = ("#[range=window|#{window_index}]"
        "#{?window_active,#{E:window-status-current-format},#{E:window-status-format}}"
        "#[norange default]")
# The pages on the left, in order. An agent window has no tab of its own here.
STATUS_WINDOWS = "#{W:#{?" + IS_PAGE + "," + _TAB + ",}}"
# An agent that rings for you goes on the right, next to the key that cycles the pages — the middle of the bar
# stays empty rather than pushing the pages around every time something needs you.
STATUS_RINGING = "#{W:#{?" + IS_PAGE + ",,#{?window_bell_flag," + _TAB + ",}}}"
STATUS_RIGHT = ("#[align=right range=right #{E:status-right-style}]" + STATUS_RINGING + "#[push-default]"
                "#{T;=/#{status-right-length}:status-right}#[pop-default]#[norange default]")


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
            "status-format[0]": STATUS_LEFT + STATUS_WINDOWS + STATUS_RIGHT,
            "status-left-length": "40",
            "status-left": f"#[bold,fg=colour81] {project} #[fg=colour240]│",
            "status-right-length": "30",
            "status-right": f"#[fg=colour245] {KEY} / ← → pages ",
            "window-status-separator": "",
            "base-index": "1",
            "renumber-windows": "on",
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
        for window, name in self._windows():
            self._window_options(window, name)
        self._run("move-window", "-r", "-s", s, check=False)   # number the windows 1, 2, 3… from the start
        self._bind_switch_key()

    def _bind_switch_key(self) -> None:
        """ctrl+a cycles the pages: manager → tasks → agents → config → manager. From an agent it goes to tasks.

        The next page is picked by a tmux format (run-shell expands it for the window the key was pressed in);
        if that page is closed (e.g. no manager running), the tasks page is the fallback.
        """
        cycle = PAGE_CYCLE
        target = DASHBOARD_WINDOW
        for here, following in reversed(list(zip(cycle, cycle[1:] + cycle[:1]))):
            target = f"#{{?#{{==:#{{window_name}},{here}}},{following},{target}}}"
        tmux = " ".join(tmux_argv())
        self._run("bind-key", "-n", "C-a", "run-shell",
                  f"{tmux} select-window -t '={target}' 2>/dev/null || {tmux} select-window -t '={DASHBOARD_WINDOW}'",
                  check=False)

    # A tab shows the window name, a 🔔 while it rings, and a count (set by the daemon: open tasks, running agents).
    TAB = " #{?window_bell_flag,🔔 ,}#W#{?@count, (#{@count}),} "
    CURRENT_STYLE = "bold,bg=colour81,fg=colour232"
    CURRENT_TAB = f"#[{CURRENT_STYLE}]{TAB}"
    WINDOW_OPTIONS = (
        ("remain-on-exit", "on"), ("automatic-rename", "off"), ("allow-rename", "off"),
        ("monitor-bell", "on"),
        ("window-status-format", TAB),
        ("window-status-current-format", CURRENT_TAB),
        ("window-status-bell-style", "bold,bg=colour214,fg=colour232"),
    )
    AGENT_STATUS_FORMAT = "#{?window_bell_flag, 🔔 #W ,}"   # agents stay out of the bar unless they ring
    # The bar never shows an agent's own tab. While you are inside an agent, the `agents` tab lights up instead
    # (a click on it then opens the agents list). tmux evaluates this for the agents tab on every redraw:
    # the active window's name, matched against the windows that do have their own tab.
    _ACTIVE_WINDOW = "#{W:#{?window_active,#{window_name},}}"
    _ON_AGENT = f"#{{m/r:^({'|'.join((MANAGER_WINDOW, *PAGE_WINDOWS))})$,{_ACTIVE_WINDOW}}}"
    AGENTS_TAB_FORMAT = f"#{{?{_ON_AGENT},{TAB},#[{CURRENT_STYLE.replace(',', '#,')}]{TAB}}}"   # #, = comma inside #{?…}

    def _window_options(self, target: str, name: str) -> None:
        """Window-scoped options must be set on every window; a session-level set only reaches the current one.

        Agent windows are hidden from the bar (they are opened from the tasks/agents pages) unless they ring for
        you; while you are inside one, the `agents` tab is highlighted in its place. Claude windows keep remain-on-exit so the daemon can read how they ended;
        page windows simply disappear when their page exits (no "Pane is dead").
        """
        for key, value in self.WINDOW_OPTIONS:
            self._run("set-option", "-w", "-t", target, key, value, check=False)
        if name in PAGE_WINDOWS:
            self._run("set-option", "-w", "-t", target, "remain-on-exit", "off", check=False)
            if name == AGENTS_WINDOW:
                self._run("set-option", "-w", "-t", target, "window-status-format", self.AGENTS_TAB_FORMAT, check=False)
        elif name != MANAGER_WINDOW:
            self._run("set-option", "-w", "-t", target, "window-status-format", self.AGENT_STATUS_FORMAT, check=False)
            self._run("set-option", "-w", "-t", target, "window-status-current-format", "", check=False)

    # ---------------------------------------------------------------- windows
    def new_window(self, name: str, cwd: Path, argv: list[str], env: dict[str, str], first: bool = False) -> str:
        """Start argv in a new window and return its stable window id (like '@7').

        Windows are ordered manager, sessions…, tasks, agents, config: sessions go right before the first page window,
        `first` ones at the front, pages at the end.
        """
        env_prefix = _clean_env_prefix() + [f"{k}={v}" for k, v in env.items()]
        place: list[str] = []
        first_page = next((w for w in (self.find_window(n) for n in PAGE_WINDOWS) if w), None)
        if first and (ids := self._window_ids()):
            place = ["-b", "-t", ids[0]]
        elif first_page and name not in PAGE_WINDOWS:
            place = ["-b", "-t", first_page]
        else:
            place = ["-t", self.session]
        proc = self._run(
            "new-window", "-d", "-P", "-F", "#{window_id}",
            *place, "-n", name, "-c", str(cwd),
            *env_prefix, *argv,
        )
        window_id = proc.stdout.strip()
        self._window_options(window_id, name)
        return window_id

    def _window_ids(self) -> list[str]:
        proc = self._run("list-windows", "-t", self.session, "-F", "#{window_id}", check=False)
        return proc.stdout.split() if proc.returncode == 0 else []

    def _windows(self) -> list[tuple[str, str]]:
        """(window id, name) for every window in the session."""
        proc = self._run("list-windows", "-t", self.session, "-F", "#{window_id} #{window_name}", check=False)
        return [tuple(line.partition(" ")[::2]) for line in proc.stdout.splitlines()]

    def find_window(self, name: str) -> str | None:
        return next((wid for wid, wname in self._windows() if wname == name), None)

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

    def select_page(self, here: str, step: int) -> None:
        """← / → on a page: go to the previous / next page in PAGE_CYCLE that is open (agents are skipped)."""
        open_pages = [name for name in PAGE_CYCLE if self.find_window(name)]
        if here not in open_pages:
            return
        target = open_pages[(open_pages.index(here) + step) % len(open_pages)]
        self._run("select-window", "-t", f"={target}", check=False)

    def set_counts(self, counts: dict[str, int]) -> None:
        """Put a number next to a page name in the bar (0 removes it). Keyed by window name."""
        for name, count in counts.items():
            window = self.find_window(name)
            if not window:
                continue
            if count:
                self._run("set-option", "-w", "-t", window, "@count", str(count), check=False)
            else:
                self._run("set-option", "-w", "-t", window, "-u", "@count", check=False)

    def detach(self) -> None:
        self._run("detach-client", "-s", self.session, check=False)

    def attach_argv(self, window_id: str | None = None) -> list[str]:
        if window_id:
            self.select_window(window_id)
        return tmux_argv("attach-session", "-t", self.session)


def _clean_env_prefix() -> list[str]:
    """Claude refuses to start inside another Claude session; strip those markers from the child env."""
    return ["env", "-u", "CLAUDECODE", "-u", "CLAUDE_CODE_ENTRYPOINT"]
