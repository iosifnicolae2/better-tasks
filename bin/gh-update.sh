#!/bin/sh
# Brings the GitHub CLI to a version that puts videos in PRs (gh pr create --attach, gh 2.99+).
# Run by better-tasks when "PR per task" is on and gh is missing or too old; safe to run again.
# Last line: "ready <gh --version>", "login <gh --version>" (installed, not signed in) or "failed: <why>".
set -u
PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
log="${TMPDIR:-/tmp}/better-tasks-gh-update.log"

if ! command -v brew >/dev/null; then
  echo "failed: no Homebrew to update gh with; update it by hand: https://github.com/cli/cli#installation"
  exit 1
fi
if brew list --formula gh >/dev/null 2>&1; then brew upgrade gh; else brew install gh; fi >"$log" 2>&1 ||
  { echo "failed: brew could not update gh (log: $log)"; exit 1; }

version="$(gh --version | head -1)"
if gh auth status >/dev/null 2>&1; then echo "ready $version"; else echo "login $version"; fi
