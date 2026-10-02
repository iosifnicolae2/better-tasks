"""What a session spent: tokens counted from its own transcript, and what those tokens cost.

Open this to change a price, or to see how a transcript is counted. Prices are US dollars per million tokens
and a project overrides any of them under [prices] in config.toml. Nothing here talks to a network: the tools
write every request's token count into their own transcript, and we add them up.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

# Dollars per million tokens: input, output, writing to the cache (5 minutes / 1 hour), reading from it.
# A model matches the longest key its name starts with, so one line covers a whole family.
PRICES: dict[str, tuple[float, float, float, float, float]] = {
    "claude-fable-5":  (10.0, 50.0, 12.50, 20.0, 0.25),
    "claude-mythos-5": (10.0, 50.0, 12.50, 20.0, 0.25),
    "claude-opus-5":   (5.0, 25.0, 6.25, 10.0, 0.50),
    "claude-opus-4":   (5.0, 25.0, 6.25, 10.0, 0.50),
    "claude-sonnet-5": (2.0, 10.0, 2.50, 4.0, 0.20),
    "claude-sonnet-4": (3.0, 15.0, 3.75, 6.0, 0.30),
    "claude-haiku-4":  (1.0, 5.0, 1.25, 2.0, 0.10),
}

# What is counted. Everything else in a usage dict is bookkeeping: cost, priced, offset, last, updated_at.
COUNTS = ("input", "output", "cache_write", "cache_write_1h", "cache_read")


def zero() -> dict:
    """A session that has spent nothing yet. `priced` turns false the moment a model with no price is seen:
    the token counts stay right, the cost stops being the whole story."""
    return {**{name: 0 for name in COUNTS}, "cost": 0.0, "priced": True,
            "offset": 0, "last": "", "updated_at": 0.0}


def tokens(counted: dict | None) -> int:
    """One number for "how much did it read and write" — what a token budget is measured against."""
    return sum(int((counted or {}).get(name, 0)) for name in COUNTS)


def total(parts) -> dict:
    """Several sessions as one. A cost is only as good as its parts: unpriced anywhere, unpriced here."""
    out = zero()
    for part in parts:
        if not part:
            continue
        for name in COUNTS:
            out[name] += int(part.get(name, 0))
        out["cost"] += float(part.get("cost", 0.0))
        out["priced"] &= bool(part.get("priced", True))
        out["updated_at"] = max(out["updated_at"], float(part.get("updated_at", 0.0)))
    out.pop("offset"), out.pop("last")   # a sum has no place in a file to go back to
    return out


def price_of(model: str, prices: dict | None = None) -> tuple | None:
    """What a million tokens of this model cost, or None when nobody has told us."""
    model = (model or "").strip().lower()
    if not model:
        return None
    table = {**PRICES, **{k.lower(): tuple(v) for k, v in (prices or {}).items()}}
    key = max((k for k in table if model.startswith(k)), key=len, default="")
    if not key:
        key = next((k for k in table if k in model), "")   # "anthropic/claude-opus-5", "opus-5-20260401"
    row = table.get(key)
    return tuple(row) + (0.0,) * (5 - len(row)) if row else None


def read(path, counted: dict | None = None, model: str = "", prices: dict | None = None) -> dict:
    """Add what is new in a transcript to what was counted before.

    `counted` is what this returned last time (or None). It carries the byte offset of everything already
    added, so each line is read once and this is cheap enough to call on every hook."""
    counted = {**zero(), **(counted or {})}
    file = Path(path or "")
    if not file.is_file():
        return counted
    size = file.stat().st_size
    if size < counted["offset"]:   # a new conversation was written over the old one: read it from the top
        counted["offset"], counted["last"] = 0, ""
    if size <= counted["offset"]:
        return counted
    with file.open("rb") as f:
        f.seek(counted["offset"])
        chunk = f.read(size - counted["offset"])
    end = chunk.rfind(b"\n") + 1   # a half-written last line waits for the next read
    if not end:
        return counted
    counted["offset"] += end
    for line in chunk[:end].splitlines():
        entry = _entry(line)
        if not entry:
            continue
        key, seen_model, counts = entry
        if key and key == counted["last"]:   # one answer, written over several lines: count it once
            continue
        counted["last"] = key
        for name, n in counts.items():
            counted[name] += n
        rate = price_of(seen_model or model, prices)
        if rate:
            counted["cost"] += _cost(counts, rate)
        else:
            counted["priced"] = False
    counted["updated_at"] = time.time()
    return counted


def codex_transcript(session_id: str) -> str:
    """Where Codex keeps a session's rollout file. It never tells us, but the file is named after the session."""
    if not session_id:
        return ""
    found = sorted(Path.home().glob(f".codex/sessions/*/*/*/rollout-*-{session_id}.jsonl"))
    return str(found[-1]) if found else ""


def _cost(counts: dict, rate: tuple) -> float:
    return sum(counts.get(name, 0) * price for name, price in zip(COUNTS, rate)) / 1_000_000


def _entry(line: bytes) -> tuple[str, str, dict] | None:
    """One transcript line as (what identifies it, the model, the tokens) — or None when it spent nothing.
    Claude and Codex write different shapes; the line itself says which."""
    try:
        d = json.loads(line)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    if not isinstance(d, dict):
        return None
    return _claude(d) or _codex(d)


def _claude(d: dict) -> tuple[str, str, dict] | None:
    """Claude Code writes one entry per answer, with the request's own usage. The same answer can be written
    over several lines (text, then a tool call), each repeating that usage: hence the id."""
    message = d.get("message")
    used = message.get("usage") if isinstance(message, dict) else None
    if not isinstance(used, dict):
        return None
    made = used.get("cache_creation") or {}
    long = int(made.get("ephemeral_1h_input_tokens", 0))
    return (str(d.get("requestId") or message.get("id") or ""),
            str(message.get("model") or ""),
            {"input": int(used.get("input_tokens", 0)),
             "output": int(used.get("output_tokens", 0)),
             "cache_write": int(used.get("cache_creation_input_tokens", 0)) - long,
             "cache_write_1h": long,
             "cache_read": int(used.get("cache_read_input_tokens", 0))})


def _codex(d: dict) -> tuple[str, str, dict] | None:
    """Codex reports after each turn: `last_token_usage` is that turn, and its input count already includes
    what was read from the cache."""
    payload = d.get("payload")
    if not isinstance(payload, dict) or payload.get("type") != "token_count":
        return None
    turn = ((payload.get("info") or {}).get("last_token_usage")) or {}
    cached = int(turn.get("cached_input_tokens", 0))
    return ("", "", {"input": max(0, int(turn.get("input_tokens", 0)) - cached),
                     "output": int(turn.get("output_tokens", 0)),
                     "cache_write": int(turn.get("cache_write_input_tokens", 0)),
                     "cache_write_1h": 0,
                     "cache_read": cached})


# ------------------------------------------------------------------------------- how it reads on a page
def money(amount: float, priced: bool = True) -> str:
    """A cost, as short as it can be without lying: `$12.40`, `$0.83`, `$0.004`, and `~` in front when some
    of it ran on a model nobody priced."""
    if not amount:
        return "" if priced else "~"
    mark = "" if priced else "~"
    if amount >= 10:
        return f"{mark}${amount:,.0f}"
    if amount >= 0.1:
        return f"{mark}${amount:.2f}"
    return f"{mark}${amount:.3f}"


def short(count: int) -> str:
    """A token count at a glance: 984, 12.3k, 4.2M."""
    if count >= 1_000_000:
        return f"{count / 1_000_000:.1f}M"
    if count >= 1_000:
        return f"{count / 1_000:.1f}k"
    return str(count)
