#!/bin/sh
# One-time fix for a better-tasks update that keeps failing ("its source doesn't match its extraKnownMarketplaces
# entry", or "already at the latest version"): your Claude Code settings pin an old release, and better-tasks before
# v0.11.8 can't move that pin. Moves it to the latest release, updates better-tasks, and moves this folder's
# project pin. Safe to run again. Run it in the project folder:
#   curl -fsSL https://raw.githubusercontent.com/iosifnicolae2/better-tasks/main/bin/fix-update.sh | sh
set -eu

UPSTREAM=iosifnicolae2/better-tasks
PLUGIN=better-tasks@better-tasks
USER_SETTINGS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
HERE="$(pwd -P)"
PROJECT_SETTINGS="$HERE/.claude/settings.json"

# The JSON steps, in JavaScript: macOS runs it with osascript (always there), elsewhere node.
#   declared <settings>   "<source>\t<ref>" of the better-tasks declaration, nothing when there is none
#   setref <settings> <tag>   the declaration's ref set to <tag>, the rest kept
#   installs <list.json>  "<scope>\t<version>\t<projectPath>" per better-tasks install
JS='
function main(argv, read, write) {
  const [mode, file, tag] = argv
  const json = JSON.parse(read(file) || "{}")
  if (mode === "installs") return json.filter(e => e.id === "better-tasks@better-tasks").map(e => [e.scope, e.version, e.projectPath || ""].join("\t")).join("\n")
  const entry = (json.extraKnownMarketplaces || {})["better-tasks"]
  const source = entry && entry.source
  if (mode === "declared") return source ? [source.repo || source.url || "", source.ref || ""].join("\t") : ""
  source.ref = tag
  write(file, JSON.stringify(json, null, 2) + "\n")
  return ""
}
function run(argv) {
  ObjC.import("Foundation")
  const read = f => { const s = $.NSString.stringWithContentsOfFileEncodingError(f, $.NSUTF8StringEncoding, null); return s.isNil() ? "" : s.js }
  const write = (f, text) => $(text).writeToFileAtomicallyEncodingError(f, true, $.NSUTF8StringEncoding, null)
  return main(argv, read, write) || undefined
}
if (typeof process !== "undefined") {
  const fs = require("fs")
  const out = main(process.argv.slice(1), f => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : ""), (f, text) => fs.writeFileSync(f, text))
  if (out) console.log(out)
}
'

json() {
  if [ "$(uname)" = Darwin ]; then osascript -l JavaScript -e "$JS" "$@" </dev/null
  elif command -v node >/dev/null; then node -e "$JS" "$@" </dev/null
  else echo "better-tasks: needs node to edit the settings; follow the README's Update section instead" >&2; exit 1
  fi
}

claude_() { claude "$@" </dev/null; }

latest_tag() {
  git ls-remote --tags --refs "https://github.com/$UPSTREAM.git" </dev/null | sed -n 's|.*refs/tags/v\([0-9]*\.[0-9]*\.[0-9]*\)$|\1|p' |
    sort -t. -k1,1n -k2,2n -k3,3n | tail -1 | sed 's/^/v/'
}

# The marketplace moves to the release: from the pin in your settings (moved first, put back when the add fails).
move_marketplace() {
  declared="$(json declared "$USER_SETTINGS")"
  source="$(printf '%s' "$declared" | cut -f1)"
  ref="$(printf '%s' "$declared" | cut -f2)"
  if [ -n "$ref" ]; then
    cp "$USER_SETTINGS" "$USER_SETTINGS.bak-better-tasks"
    json setref "$USER_SETTINGS" "$tag"
    claude_ plugin marketplace add --scope user -- "$source#$tag" ||
      { cp "$USER_SETTINGS.bak-better-tasks" "$USER_SETTINGS"; echo "better-tasks: could not add $source#$tag; your settings are as they were" >&2; exit 1; }
    echo "better-tasks: $USER_SETTINGS now pins $tag (the old file: $USER_SETTINGS.bak-better-tasks)"
  elif [ -z "$declared" ] && [ -n "$(json declared "$PROJECT_SETTINGS" | cut -f2)" ]; then
    claude_ plugin marketplace add --scope project -- "$UPSTREAM#$tag"
  else
    claude_ plugin marketplace update better-tasks
  fi
}

# This folder's project pin follows (the project add above already moved it).
move_project_pin() {
  pinned="$(json declared "$PROJECT_SETTINGS" | cut -f2)"
  [ -n "$pinned" ] && [ "$pinned" != "$tag" ] || return 0
  json setref "$PROJECT_SETTINGS" "$tag"
  echo "better-tasks: .claude/settings.json now pins $tag; commit it for your teammates"
}

# Your install, and this folder's own install when it has one; other projects' installs update at their next start.
update_installs() {
  list="$(mktemp)"
  claude_ plugin list --json >"$list"
  json installs "$list" | while IFS="$(printf '\t')" read -r scope version project; do
    if [ "$scope" = user ] || [ "$project" = "$HERE" ]; then claude_ plugin update --scope "$scope" -- "$PLUGIN"; fi
  done
  claude_ plugin list --json >"$list"
  json installs "$list" | while IFS="$(printf '\t')" read -r scope version project; do
    if [ "$scope" = user ] || [ "$project" = "$HERE" ]; then echo "better-tasks: $scope install: $version"; fi
  done
  rm -f "$list"
}

main() {
  command -v claude >/dev/null || { echo "better-tasks: no claude command found" >&2; exit 1; }
  tag="$(latest_tag)"
  [ -n "$tag" ] || { echo "better-tasks: could not find its latest release (offline?)" >&2; exit 1; }
  echo "better-tasks: moving to $tag"
  move_marketplace
  move_project_pin
  update_installs
  echo "better-tasks: done. Restart Claude Code to use $tag."
}

main
