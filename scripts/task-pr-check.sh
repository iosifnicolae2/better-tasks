#!/bin/sh
# Checks bin/task_pr.py on a scratch repo with a stand-in gh: the draft PR before the approval, its video, its URL
# last, a public repo's video on the videos branch and a private one's attached, a new video in place of the old one, --ready, straight to main's review PR and its close.
# Run: sh scripts/task-pr-check.sh (the plugin test runner can't start a shell). Prints "ok" or what failed.
set -u
script="$(cd "$(dirname "$0")/.." && pwd)/bin/task_pr.py"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failed=0
fail() { echo "fail: $*"; failed=1; }

# A gh that keeps one PR in $work/pr.json and logs each call.
mkdir "$work/bin"
cat >"$work/bin/gh" <<'EOF'
#!/usr/bin/env python3
import json, os, sys
state = os.path.join(os.environ["PR_STATE"], "pr.json")
args = sys.argv[1:]
open(os.path.join(os.environ["PR_STATE"], "gh.log"), "a").write(" ".join(args[:2] + [a for a in args if a.startswith("--") and a not in ("--body", "--title")]) + "\n")
pr = json.load(open(state)) if os.path.exists(state) else None
arg = lambda name: args[args.index(name) + 1] if name in args else None
if args == ["--version"]:
    print("gh version 2.102.0 (2026-09-30)")
elif args[:2] == ["repo", "view"]:
    print(os.environ.get("REPO_VISIBILITY", "PUBLIC"))
elif args[:2] == ["pr", "view"]:
    if not pr: sys.exit(1)
    print(pr["url"] if "-q" in args else json.dumps(pr))
elif args[:2] == ["pr", "create"]:
    pr = {"url": "https://github.com/someone/app/pull/7", "body": arg("--body"), "isDraft": "--draft" in args, "base": arg("--base")}
    json.dump(pr, open(state, "w")); print("Creating pull request\n" + pr["url"])
elif args[:2] == ["pr", "edit"]:
    pr["body"] = arg("--body"); json.dump(pr, open(state, "w"))
elif args[:2] == ["pr", "ready"]:
    pr["isDraft"] = False; json.dump(pr, open(state, "w"))
elif args[:2] == ["pr", "close"]:
    os.remove(state)
EOF
chmod +x "$work/bin/gh"
export PATH="$work/bin:$PATH" PR_STATE="$work" GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

git init -q --bare -b main "$work/origin.git"
git clone -q "$work/origin.git" "$work/app" 2>/dev/null
cd "$work/app" || exit 1
commit() { echo "$2" >"$1"; git add "$1"; git -c core.hooksPath=/dev/null commit -qm "$3"; }
commit a.txt one "Start"
git push -q origin main
mkdir -p .claude/tasks .claude/tasks_videos
printf -- '---\ntitle: Show the title\n---\n## Goal\nShow the title.\n' >.claude/tasks/T-9-show.md
printf 'first video' >.claude/tasks_videos/T-9.mp4
printf 'poster' >.claude/tasks_videos/T-9.png
echo '.claude/' >.git/info/exclude
pr() { python3 "$script" "$@" 2>&1; }
pr_field() { python3 -c "import json,sys; print(json.load(open('$work/pr.json'))['$1'])"; }

# Straight to main: a review PR, a draft into the commit before the task's first, the other task's commit left out.
echo '{"gitFlow": "direct"}' >.claude/tasks/config.json
commit b.txt b "Title under the id (T-9)"
commit c.txt c "Something else (T-10)"
commit b.txt b2 "Wrap the title (T-9)"
out="$(pr open T-9)"
[ "$(echo "$out" | tail -1)" = "https://github.com/someone/app/pull/7" ] || fail "open's last line is not the PR's URL: $out"
[ "$(pr_field base)" = "task/T-9-base" ] || fail "the review PR goes into $(pr_field base)"
[ "$(pr_field isDraft)" = True ] || fail "the review PR is not a draft"
pr_field body | grep -q '^> For review only' || fail "the review PR doesn't say it never merges"
pr_field body | grep -q '<!-- video ' || fail "the PR has no video"
grep 'pr create' "$work/gh.log" | grep -q -- --attach && fail "a public repo's video was attached (it opens only signed in)"
git ls-remote --heads origin better-tasks-videos | grep -q . || fail "a public repo's video is not on the videos branch"
git fetch -q origin
git ls-tree -r --name-only origin/task/T-9 | grep -q c.txt && fail "the review PR holds another task's file"
[ "$(git show origin/task/T-9:b.txt)" = b2 ] || fail "the review PR lacks the task's last commit"

# Run again with a new video: it takes the old one's place.
old_body="$(pr_field body)"
printf 'second video' >.claude/tasks_videos/T-9.mp4
pr open T-9 >/dev/null
[ "$(pr_field body)" != "$old_body" ] || fail "a new video didn't replace the old one"
[ "$(pr_field body | grep -c '<!-- video ')" = 1 ] || fail "the PR shows two videos"
before="$(wc -l <"$work/gh.log")"
pr open T-9 >/dev/null
tail -n +"$((before + 1))" "$work/gh.log" | grep -q 'pr edit' && fail "the same video was put up again"
pr open T-9 --ready | grep -q 'stays a draft' || fail "straight to main let a review PR become ready"

pr close T-9 >/dev/null
[ -e "$work/pr.json" ] && fail "close left the PR open"
git ls-remote --heads origin 'task/*' | grep -q . && fail "close left branches: $(git ls-remote --heads origin)"

# Shared dev branch: a draft into main, ready after the yes.
echo '{"gitFlow": "dev-prs"}' >.claude/tasks/config.json
git checkout -qb dev
commit d.txt d "Dev change (T-11)"
printf 'video' >.claude/tasks_videos/T-11.mp4
printf 'poster' >.claude/tasks_videos/T-11.png
REPO_VISIBILITY=PRIVATE pr open T-11 >/dev/null
grep 'pr create' "$work/gh.log" | tail -1 | grep -q -- --attach || fail "a private repo's video was not attached"
[ "$(pr_field base)" = main ] || fail "the dev PR goes into $(pr_field base)"
[ "$(pr_field isDraft)" = True ] || fail "the dev PR is not a draft before the yes"
pr_field body | grep -q 'For review only' && fail "a dev PR says it is for review only"
pr open T-11 --ready >/dev/null
[ "$(pr_field isDraft)" = False ] || fail "--ready left the PR a draft"

[ "$failed" = 0 ] && echo ok
exit "$failed"
