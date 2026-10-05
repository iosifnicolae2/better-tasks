#!/bin/sh
# Checks bin/video-branch.sh's web links: right address, never a user or token from the remote.
# Run: sh scripts/video-branch-check.sh (the plugin test runner can't start a shell). Prints "ok" or what failed.
script="$(dirname "$0")/../bin/video-branch.sh"
failed=0

expect() { # <remote url> <expected web url, empty when it must refuse>
  got="$(sh "$script" --web-url "$1" 2>/dev/null)"
  [ "$got" = "$2" ] || { echo "fail: $1 -> '$got', expected '$2'"; failed=1; }
}

expect 'git@github.com:someone/app.git' 'https://github.com/someone/app'
expect 'ssh://git@gitlab.com:2222/someone/app.git' 'https://gitlab.com/someone/app'
expect 'https://github.com/someone/app.git' 'https://github.com/someone/app'
expect 'https://someone:ghp_secret@github.com/someone/app.git' 'https://github.com/someone/app'
expect 'https://x-access-token:abc@gitlab.com/someone/app' 'https://gitlab.com/someone/app'
expect 'https://github.com/someone/app@weird:secret@host' ''

[ "$failed" = 0 ] && echo ok
exit "$failed"
