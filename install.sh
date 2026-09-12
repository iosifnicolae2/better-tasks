#!/usr/bin/env sh
# Installs the `supermanager` / `sm` commands and links them to this checkout (an editable install, so your
# edits are live). The usual way to run it is `make install` from a clone.
#
# Run from anywhere without a clone and it clones into ~/.local/share/supermanager/src (or updates it) — that
# is the "managed" install that follows releases; see supermanager upgrade.
set -eu

REPO_URL="${SUPERMANAGER_REPO:-https://github.com/bringes/supermanager}"
SRC_DIR="${SUPERMANAGER_SRC:-$HOME/.local/share/supermanager/src}"

script_dir="$(cd "$(dirname "$0")" 2>/dev/null && pwd || pwd)"
if grep -qs '^name = "supermanager"' "$script_dir/pyproject.toml"; then
  here="$script_dir"                       # run from a checkout: link this folder
else
  if [ -d "$SRC_DIR/.git" ]; then
    echo "Updating $SRC_DIR ..."
    git -C "$SRC_DIR" pull --ff-only
  else
    echo "Cloning $REPO_URL into $SRC_DIR ..."
    mkdir -p "$(dirname "$SRC_DIR")"
    git clone "$REPO_URL" "$SRC_DIR"
  fi
  here="$SRC_DIR"
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "uv not found, installing it..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

if ! command -v tmux >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "tmux not found, installing it with brew..."
    brew install tmux
  else
    echo "tmux not found. Install it first (macOS: brew install tmux, Debian/Ubuntu: sudo apt install tmux)." >&2
    exit 1
  fi
fi

echo "Linking supermanager to $here ..."
uv tool install --editable "$here" --reinstall

echo
echo "Installed. Commands: supermanager, sm  ->  $here"
command -v supermanager >/dev/null 2>&1 \
  || echo "Note: add ~/.local/bin to your PATH (run: uv tool update-shell) and open a new terminal."
