#!/bin/sh
# Checks bin/open-pr.sh sends the gh token only to GitHub's own hosts, never to another link in a PR body.
# Run: sh scripts/open-pr-check.sh (the plugin test runner can't start a shell). Prints "ok" or what failed.
script="$(dirname "$0")/../bin/open-pr.sh"
failed=0

expect() { # <link> <yes|no>
  got="$(sh "$script" --sends-token "$1")"
  [ "$got" = "$2" ] || { echo "fail: $1 -> '$got', expected '$2'"; failed=1; }
}

expect 'https://github.com/user-attachments/assets/b31c47a6-4543-4705-a3a4-607d59149d47' yes
expect 'https://user-images.githubusercontent.com/1/a.png' yes
expect 'https://private-user-images.githubusercontent.com/1/a.mp4' yes
expect 'https://cdn.jsdelivr.net/gh/someone/app@videos/T-004.png' no
expect 'https://raw.githubusercontent.com/someone/app/videos/T-004.mp4' no
expect 'https://github.com.evil.example/a.png' no
expect 'https://github.com@evil.example/a.png' no
expect 'http://github.com/user-attachments/assets/x' no
expect 'https://evil.example/https://github.com/a.png' no
expect '' no

[ "$failed" = 0 ] && echo ok
exit "$failed"
