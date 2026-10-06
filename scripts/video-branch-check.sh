#!/bin/sh
# Checks bin/video-branch.sh's web links: right address, never a user or token from the remote.
# Run: sh scripts/video-branch-check.sh (the plugin test runner can't start a shell). Prints "ok" or what failed.
script="$(cd "$(dirname "$0")/.." && pwd)/bin/video-branch.sh"
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

# Each push keeps the new files and the newest older ones that fit the budget; older commits stay untouched.
check_budget() {
  work="$(mktemp -d)"
  git init -q --bare "$work/origin.git"
  git init -q "$work/repo"
  git -C "$work/repo" remote add origin "$work/origin.git"
  for task in T-1 T-2 T-3; do
    head -c 400 /dev/zero | tr '\0' "${task#T-}" >"$work/$task.mp4"
    head -c 100 /dev/zero | tr '\0' "${task#T-}" >"$work/$task.png"
    (cd "$work/repo" && BETTER_TASKS_VIDEO_BRANCH_BUDGET=1000 sh "$script" "$work/$task.mp4" "$work/$task.png" >/dev/null 2>&1) \
      || { echo "fail: video-branch.sh could not push $task"; failed=1; }
  done
  tree() { git -C "$work/origin.git" ls-tree --name-only "$1" | tr '\n' ' '; }
  [ "$(tree better-tasks-videos)" = "T-2.mp4 T-2.png T-3.mp4 T-3.png " ] \
    || { echo "fail: newest tree is '$(tree better-tasks-videos)', expected T-2 and T-3 only"; failed=1; }
  [ "$(tree better-tasks-videos~1)" = "T-1.mp4 T-1.png T-2.mp4 T-2.png " ] \
    || { echo "fail: the commit an old link pins changed: '$(tree better-tasks-videos~1)'"; failed=1; }
  rm -rf "$work"
}
check_budget

[ "$failed" = 0 ] && echo ok
exit "$failed"
