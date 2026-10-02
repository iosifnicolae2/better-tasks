"""Keeping the machine awake while agents work, and putting the screen out when you walk away.

Open this for the exact command used on each platform. Three different things:
  - *awake* keeps the computer running (agents keep working) — it says nothing about the screen;
  - *lid* keeps it running with the laptop shut, which is a system setting and needs root on macOS;
  - *screen off* blacks the display now, and says what may bring it back (power.wake_with).
"""

from __future__ import annotations

import ctypes
import shutil
import subprocess
import sys
import time

WHY = "supermanager agents are running"
LID_SETTING = ["pmset", "-a", "disablesleep"]   # macOS: the one thing that stops a shut lid from sleeping

KEY_EVENTS = (10, 11, 12)   # CGEventType: key down, key up, modifier keys — everything the keyboard sends
ANY_EVENT = 0xFFFFFFFF      # kCGAnyInputEventType: the keyboard, the mouse, the trackpad, the lot
HID_STATE = 1               # CGEventSourceStateID: what the hardware itself has seen, not one app's events
_seconds_since = None       # the CoreGraphics call, looked up once; False once we know it is not there


def is_mac() -> bool:
    return sys.platform == "darwin"


def keep_awake_argv(with_lid_closed: bool = False) -> list[str]:
    """A command that holds the machine awake for as long as it runs, or [] when this platform has none.

    macOS: `caffeinate -i -m -s` — no idle sleep, no disk sleep, no system sleep on mains. The display is left
    alone on purpose, so it can still go black by itself or on request. A shut lid is *not* covered: nothing a
    normal user can run holds that, which is what `set_lid_sleep_disabled` is for.
    Linux: systemd's inhibitor, for the same reasons — and there the lid switch is just one more thing to
    inhibit, no root needed.
    """
    if is_mac():
        return ["caffeinate", "-i", "-m", "-s"]
    if shutil.which("systemd-inhibit"):
        what = "idle:sleep:handle-lid-switch" if with_lid_closed else "idle:sleep"
        return ["systemd-inhibit", f"--what={what}", f"--why={WHY}", "--mode=block", "sleep", "infinity"]
    return []


def lid_sleep_disabled() -> bool | None:
    """Is this machine set to keep running with the lid shut? None where it cannot be asked.

    macOS keeps one machine-wide switch for it, `SleepDisabled`, which `pmset -g` prints."""
    if not is_mac():
        return None
    proc = subprocess.run(["pmset", "-g"], capture_output=True, text=True)
    for line in proc.stdout.splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[0] == "SleepDisabled":
            return parts[1] != "0"
    return None


def lid_command(closed_stays_awake: bool) -> str:
    """The command a person types to set this by hand, for when we cannot."""
    return "sudo " + " ".join([*LID_SETTING, "1" if closed_stays_awake else "0"])


def set_lid_sleep_disabled(closed_stays_awake: bool) -> str:
    """Turn lid-close sleep off (or back on). Returns "" when it worked, or one line saying why it did not.

    `pmset disablesleep` is a system setting and needs root — `caffeinate` cannot hold a shut lid, and nor can
    anything else a normal user runs. We only ever try `sudo -n`, which never prompts: this runs in a daemon
    with no terminal to type a password into. Without a password-free rule for it that fails, and the caller
    tells the user the command to run instead.
    """
    if not is_mac():
        return "Keeping a shut lid awake is a macOS setting; this machine does it another way."
    argv = ["sudo", "-n", *LID_SETTING, "1" if closed_stays_awake else "0"]
    try:
        proc = subprocess.run(argv, capture_output=True, text=True, stdin=subprocess.DEVNULL)
    except OSError as exc:
        return f"Could not run {' '.join(LID_SETTING)}: {exc}"
    if proc.returncode == 0 and lid_sleep_disabled() == closed_stays_awake:
        return ""
    return (f"`{' '.join(LID_SETTING)}` needs root and there is no password-free rule for it here. "
            f"Run `{lid_command(closed_stays_awake)}` yourself, or add the sudoers line in docs/settings.md "
            f"so supermanager can do it.")


def user_is_here() -> bool | None:
    """Is the screen on and the user at the machine? False while the display sleeps, None when this platform
    cannot say.

    macOS keeps a power assertion called UserIsActive: 1 while the display is awake, 0 once it has gone out.
    Moving the mouse wakes the display and puts it back to 1, which is exactly the signal we want.
    """
    if is_mac():
        proc = subprocess.run(["pmset", "-g", "assertions"], capture_output=True, text=True)
        for line in proc.stdout.splitlines():
            parts = line.split()
            if len(parts) == 2 and parts[0] == "UserIsActive" and parts[1].isdigit():
                return parts[1] != "0"
        return None
    if shutil.which("xset"):
        proc = subprocess.run(["xset", "q"], capture_output=True, text=True)
        if "Monitor is" in proc.stdout:
            return "Monitor is On" in proc.stdout
    return None


def _event_idle(*events: int) -> float | None:
    """Seconds since the last of these input events, or None where we cannot ask.

    macOS answers through CoreGraphics (`CGEventSourceSecondsSinceLastEventType`), loaded straight out of the
    framework with ctypes so this needs no extra package. It can be asked per kind of event, which is what
    lets us tell a key press from a mouse move — `pmset` and `ioreg` only know "something was touched".
    """
    global _seconds_since
    if not is_mac():
        return None
    if _seconds_since is None:
        try:
            lib = ctypes.CDLL("/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices")
            _seconds_since = lib.CGEventSourceSecondsSinceLastEventType
            _seconds_since.restype = ctypes.c_double
            _seconds_since.argtypes = [ctypes.c_uint32, ctypes.c_uint32]
        except (OSError, AttributeError):
            _seconds_since = False
    if not _seconds_since:
        return None
    return min(_seconds_since(HID_STATE, event) for event in events)


def input_idle() -> float | None:
    """Seconds since anything at all was touched, or None where this platform cannot say. Costs nothing (no
    process is started), so it is the cheap way to ask "could the screen possibly have woken?"."""
    return _event_idle(ANY_EVENT)


def last_key_at() -> float | None:
    """Unix time of the last key press, or None where we cannot tell a key from a mouse move."""
    idle = _event_idle(*KEY_EVENTS)
    return None if idle is None else time.time() - idle


def wake_allowed(wake_with: str, dark_at: float, mouse_ok_at: float) -> bool:
    """The display is on again — may it stay on?

    `dark_at` is when it last went out; `mouse_ok_at` is when the mouse becomes allowed to wake it.

    A key pressed since the screen went out always counts. Anything else counts only with
    `wake_with = anything`, and only past `mouse_ok_at` — that grace is there so the hand you are still
    moving off the trackpad does not bring the screen straight back.

    A platform that cannot tell a key from a mouse move says yes to everything: better a screen that comes
    back too easily than one that will not come back at all.
    """
    key_at = last_key_at()
    if key_at is None:
        return True
    if key_at > dark_at:
        return True
    return wake_with == "anything" and time.time() >= mouse_ok_at


def wake_hint(wake_with: str) -> str:
    """How this machine will really come back, in the words we tell the user."""
    if wake_with != "anything" and last_key_at() is not None:
        return "press a key to bring it back"
    return "move the mouse or press a key to bring it back"


def idle_seconds() -> float | None:
    """How long since the last key or mouse move, or None when this platform cannot say."""
    if not is_mac():
        return None
    proc = subprocess.run(["ioreg", "-c", "IOHIDSystem"], capture_output=True, text=True)
    for line in proc.stdout.splitlines():
        if "HIDIdleTime" in line:
            _, _, raw = line.partition("=")
            try:
                return int(raw.strip()) / 1_000_000_000   # nanoseconds
            except ValueError:
                return None
    return None


def screen_off(wake_with: str = "keyboard") -> str:
    """Turn the display off now. Returns what happened, in one line, for whoever asked.

    Turning it off is all this does. Keeping it off — putting it back out when something we do not accept
    woke it — is the caller's watch loop, built on `wake_allowed`."""
    back = f" The machine keeps working; {wake_hint(wake_with)}."
    if is_mac():
        proc = subprocess.run(["pmset", "displaysleepnow"], capture_output=True, text=True)
        if proc.returncode != 0:
            return f"Could not turn the screen off: {(proc.stderr or proc.stdout).strip()}"
        return "Screen off." + back
    for argv in (["xset", "dpms", "force", "off"], ["swaymsg", "output", "*", "dpms", "off"]):
        if shutil.which(argv[0]):
            proc = subprocess.run(argv, capture_output=True, text=True)
            if proc.returncode == 0:
                return "Screen off." + back
    return "This machine has no command I know of for turning the screen off (macOS and X11/sway are covered)."


def start_keeping_awake(with_lid_closed: bool = False) -> subprocess.Popen | None:
    """Start the holder process. Kill it (or let it die with us) and the machine sleeps normally again."""
    argv = keep_awake_argv(with_lid_closed)
    if not argv:
        return None
    try:
        return subprocess.Popen(argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                stdin=subprocess.DEVNULL, start_new_session=True)
    except OSError:
        return None
