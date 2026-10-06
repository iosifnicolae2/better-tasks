#!/bin/sh
# Runs the plugin's tests on this checkout: writes tests/templates.gen.ts from .claude/better-tasks/ first
# (the test runner can't read files), then `claude plugin test`. Usage: sh scripts/test.sh
set -e
root=$(cd "$(dirname "$0")/.." && pwd)
bun "$root/scripts/templates.ts"
exec claude plugin test "$root"
