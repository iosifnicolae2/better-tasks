#!/usr/bin/env python3
"""A pull request per task, with its before/after video in it, opened before the user is asked to approve.

    python3 task_pr.py open T-004 [--body-file pr.md] [--ready] [--dry-run]           picks the task's commits
    python3 task_pr.py open T-004 --here [--body-file pr.md] [--ready] [--dry-run]    this checkout's branch (a worktree)
    python3 task_pr.py close T-004
    python3 task_pr.py sync

The last line `open` prints is the PR's URL: the link the lead puts in the approval question.

`open` opens a draft PR; run it again with --ready after the user's yes and the full tests (a draft can't merge).
Run again, it pushes what's new, and a new video (another .mp4 than the PR shows) takes the old one's place.

`open` puts every commit whose subject names the task ("(T-004)") onto branch `task/T-004`: origin's main plus
those commits, each picked with `git merge-tree`, so no file in any checkout changes. The commits come from the
shared dev branch (git flow "dev-prs"), or from local main under "straight to main" (the project's
.claude/tasks/config.json says which). A commit already on the branch (its "(cherry picked from commit ...)" line)
or already in main is skipped. The task's before/after video (.claude/tasks_videos/T-004.mp4 and its .png poster)
goes right after the request and why: attached by gh 2.99+, as github.com does when you drop a file in, with the
video also shown as a player under its picture. GitHub opens an attachment to whoever can see a page that shows it
(a picture or a player): anyone in a public repo, members in a private one. A video that is only a link stays
signed-in only. Without gh 2.99+: the videos branch (video-branch.sh, next to this script).

Straight to main: the PR is for review only, a draft that never merges (the commits reach main with the lead's push).
It goes into `task/T-004-base`, the commit before the task's first, so it shows the task's changes alone.
`open --here` (the default in a worktree) pushes this checkout's HEAD as `task/T-004` and opens its PR into main.

`close`, when the task closes without a merge (straight to main, or dropped): closes its PR, deletes its branches.

`sync`, after the lead merged a PR: local main follows origin's main, then dev takes origin's main in
with a merge commit, only when that changes no file of dev (dev already holds the task's changes).

Options: --dev (default: the dev branch, or main under straight to main), --main (default: origin's HEAD branch,
else main), --remote (origin). Run it from anywhere in the project.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PICKED = re.compile(r"\(cherry picked from commit ([0-9a-f]{40})\)")
ATTACH_SINCE = (2, 99, 0)


def run(*argv: str, env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(argv, cwd=ROOT, capture_output=True, text=True,
                          env=None if env is None else {**os.environ, **env})


def git(*args: str, ok: bool = False, env: dict | None = None) -> str:
    done = run("git", *args, env=env)
    if done.returncode != 0 and not ok:
        sys.exit(f"task_pr: git {' '.join(args)}: {done.stderr.strip()}")
    return done.stdout.strip() if done.returncode == 0 else ""


def succeeds(*args: str) -> bool:
    return run("git", *args).returncode == 0


def say(text: str) -> None:
    print(f"task_pr: {text}", flush=True)


ROOT = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip() or ".")
# Task files and videos are untracked: they live in the main checkout only.
MAIN_CHECKOUT = Path(subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
                                    cwd=ROOT, capture_output=True, text=True).stdout.strip() or ROOT / ".git").parent


def config() -> dict:
    try:
        return json.loads((MAIN_CHECKOUT / ".claude/tasks/config.json").read_text())
    except (OSError, ValueError):
        return {}


def tasks_folder() -> Path:
    return MAIN_CHECKOUT / str(config().get("tasksFolder", ".claude/tasks"))


def is_direct() -> bool:
    """Straight to main: the project's git flow, or the old "worktree" switch without one (the default is a PR per task)."""
    flow = config().get("gitFlow")
    return flow == "direct" or (flow is None and config().get("pullRequests") is not True and config().get("worktree") is True)


def branches(options: argparse.Namespace) -> tuple[str, str]:
    """The branch the task's commits are on, and the branch PRs go into."""
    main = options.main or default_main(options.remote)
    return options.dev or (main if is_direct() else str(config().get("devBranch") or "dev")), main


def default_main(remote: str) -> str:
    head = git("symbolic-ref", "--short", f"refs/remotes/{remote}/HEAD", ok=True)
    return head.split("/", 1)[1] if "/" in head else "main"


def task_commits(task: str, upstream: str, dev: str) -> list[str]:
    """Oldest first: the non-merge commits on dev, not in origin's main, whose subject names the task."""
    pattern = re.compile(rf"(?<![\w-]){re.escape(task)}\b")
    lines = git("log", "--reverse", "--no-merges", "--format=%H %s", f"{upstream}..{dev}").splitlines()
    return [line.split(" ", 1)[0] for line in lines if pattern.search(line.split(" ", 1)[1])]


def already_picked(upstream: str, tip: str) -> set[str]:
    return set(PICKED.findall(git("log", "--format=%B", f"{upstream}..{tip}")))


def pick(commit: str, onto: str) -> str | None:
    """`commit` replayed on `onto`; None when it changes nothing there."""
    parent = git("rev-parse", f"{commit}^")
    merged = run("git", "merge-tree", "--write-tree", f"--merge-base={parent}", onto, commit)
    if merged.returncode != 0:
        sys.exit(f"task_pr: {commit[:8]} conflicts on main: it leans on another task's commit. "
                 f"Merge that task first, or split the commit on dev.\n{merged.stdout.strip()}")
    tree = merged.stdout.split("\n", 1)[0]
    if tree == git("rev-parse", f"{onto}^{{tree}}"):
        return None
    name, email, date = git("log", "-1", "--format=%an%x00%ae%x00%aI", commit).split("\0")
    message = git("log", "-1", "--format=%B", commit) + f"\n\n(cherry picked from commit {commit})"
    return git("commit-tree", tree, "-p", onto, "-m", message,
               env={"GIT_AUTHOR_NAME": name, "GIT_AUTHOR_EMAIL": email, "GIT_AUTHOR_DATE": date})


def task_file(task: str) -> Path | None:
    found = sorted(tasks_folder().glob(f"{task}-*.md")) or sorted(tasks_folder().glob(f"{task}.md"))
    return found[0] if found else None


def task_title(path: Path | None, task: str) -> str:
    if path is None:
        return task
    match = re.search(r'^title:\s*"?(.*?)"?\s*$', path.read_text(), re.M)
    return match.group(1) if match else path.stem


def section(text: str, name: str) -> str:
    match = re.search(rf"^## {name}\n(.*?)(?=^## |\Z)", text, re.M | re.S)
    return match.group(1).strip() if match else ""


def gh_attaches() -> bool:
    """gh 2.99+ uploads files into a PR with --attach."""
    try:
        version = subprocess.run(["gh", "--version"], capture_output=True, text=True).stdout
    except OSError:
        return False
    match = re.search(r"gh version (\d+)\.(\d+)\.(\d+)", version)
    return bool(match) and tuple(map(int, match.groups())) >= ATTACH_SINCE


def video_file(task: str) -> Path:
    return MAIN_CHECKOUT / ".claude/tasks_videos" / f"{task}.mp4"


def video_id(task: str) -> str:
    """Which video this is: a PR showing another one gets this one in its place."""
    return hashlib.sha1(video_file(task).read_bytes()).hexdigest()[:12] if video_file(task).exists() else "none"


def player(video: str) -> list[str]:
    """GitHub turns a video link on its own line into a player; that is what lets visitors open it."""
    return ["<details><summary>Or play it here</summary>", "", video, "", "</details>", ""]


def video_lines(task: str) -> tuple[list[str], list[str]]:
    """The lines that show the video in the PR, and gh's --attach arguments for them (the local paths in the
    lines become the uploads' links, except the player's: show_player fills that in)."""
    video = video_file(task)
    poster = video.with_suffix(".png")
    if not (video.exists() and poster.exists()):
        return [], []
    marker = f"<!-- video {video_id(task)} -->"
    if gh_attaches():
        return ([marker, f"[![Before/after video: click to play it with sound]({poster})]({video})",
                 "Click the picture to play the video with sound (Cmd-click or Ctrl-click: in a new tab).", ""]
                + player(str(video)), ["--attach", str(poster), "--attach", str(video)])
    branch = run("sh", str(HERE / "video-branch.sh"), str(video), str(poster))
    printed = branch.stdout.strip().splitlines()
    if branch.returncode != 0 or len(printed) < 3:
        say(f"the video could not go up ({branch.stderr.strip() or 'video-branch.sh said nothing'}); the PR has none")
        return [], []
    video_url, poster_url, caption = printed[0], printed[1], printed[-1]
    return [marker, f"[![Before/after video: click to play it with sound]({poster_url})]({video_url})", caption, ""], []


def show_player(task: str, branch: str) -> None:
    """gh rewrote the picture's link to the uploaded video; the player gets the same link."""
    body = json.loads(run("gh", "pr", "view", branch, "--json", "body").stdout)["body"]
    linked = re.search(r"^\[!\[Before/after video[^\n]*\]\((https://[^)\s]+)\)$", body, re.M)
    local = f"\n{video_file(task)}\n"
    if linked and local in body:
        run("gh", "pr", "edit", branch, "--body", body.rstrip("\n").replace(local, f"\n{linked.group(1)}\n"))


def default_body(task: str, path: Path | None, commits: list[str]) -> str:
    text = path.read_text() if path else ""
    asked = section(text, "Goal") or "(see the task file)"
    to_test = next((line.split(":", 1)[1].strip() for line in section(text, "Notes").splitlines()
                    if line.strip().lower().startswith(("to test:", "- to test:"))), "")
    lines = ["## Asked for", "", asked, "", "## What changed", ""]
    lines += [f"- {git('log', '-1', '--format=%s', c)}" for c in commits]
    lines += ["", "## To test", "", to_test or "The steps are in the task file.", ""]
    lines += ["## Commits", ""] + [f"- {c[:8]}" for c in commits] + [""]
    if path:
        lines += [f"Task file: `{path.relative_to(MAIN_CHECKOUT)}`", ""]
    return "\n".join(lines)


INTRO = re.compile(r"asked|request|why|problem|motivation|context|background|summary|description|overview|about", re.I)


def video_spot(body: str) -> int:
    """Right after the request and why: before the first heading that follows them. Any template's headings
    count ("## Why", "### Motivation"); no such heading: at the top."""
    headings = list(re.finditer(r"^#{1,6} +(.*)$", body, re.M))
    seen_intro = False
    for heading in headings:
        if INTRO.search(heading.group(1)):
            seen_intro = True
        elif seen_intro:
            return heading.start()
    return len(body) if seen_intro else 0


def with_video(body: str, shown: list[str]) -> str:
    """The video goes right after the request and why it was needed (the PR template's order)."""
    if not shown:
        return body
    block = "\n".join(shown) + "\n"
    at = video_spot(body)
    if at == len(body):
        return body.rstrip("\n") + "\n\n" + block
    return body[:at] + block + body[at:]


REVIEW_NOTE = ("> For review only: these commits go straight to main. "
               "This draft never merges; it closes with the task.\n\n")
VIDEO_BLOCK = re.compile(r"^(<!-- video \w+ -->\n)?\[!\[Before/after video[^\n]*\n[^\n]*\n\n?"
                         r"(<details><summary>Or play it here</summary>\n\n[^\n]*\n\n</details>\n\n?)?", re.M)


def open_pr(task: str, options: argparse.Namespace) -> int:
    dev, main = branches(options)
    remote = options.remote
    upstream = f"{remote}/{main}"
    git("fetch", "--quiet", remote)
    branch = f"task/{task}"
    if options.here or ROOT != MAIN_CHECKOUT:
        options.here = True
        return open_here(task, branch, upstream, main, options)
    if options.ready and is_direct():
        sys.exit("task_pr: straight to main: the PR is for review only and stays a draft; close it with the task")
    if is_direct():
        commits, base, base_tip = commits_on_main(task, dev)
    else:
        commits, base, base_tip = task_commits(task, upstream, dev), main, git("rev-parse", upstream)
    if not commits:
        sys.exit(f"task_pr: no commit on {dev} names {task} in its subject")
    remote_tip = git("rev-parse", "--verify", "--quiet", f"refs/remotes/{remote}/{branch}", ok=True)
    start = remote_tip or base_tip
    done = already_picked(base_tip, remote_tip) if remote_tip else set()
    tip = start
    for commit in [c for c in commits if c not in done]:
        picked = pick(commit, tip)
        if picked:
            tip = picked
            say(f"picked {commit[:8]} {git('log', '-1', '--format=%s', commit)[:70]}")
        else:
            say(f"skipped {commit[:8]}: already in {base}")
    if options.dry_run:
        say(f"dry run: {branch} would be {tip[:8]}, its PR into {base}")
        return 0
    if base != main:
        git("push", "--quiet", "--force", remote, f"{base_tip}:refs/heads/{base}")
    if tip != start or not remote_tip:
        lease = f"--force-with-lease=refs/heads/{branch}:{remote_tip}" if remote_tip else "--force-with-lease"
        git("push", "--quiet", lease, remote, f"{tip}:refs/heads/{branch}")
    return update_pr(task, branch, options) if open_url(branch) else create_pr(task, branch, base, commits, options)


def commits_on_main(task: str, main: str) -> tuple[list[str], str, str]:
    """Straight to main, pushed or not: the task's commits on main, and the commit before the first (task/<id>-base)."""
    pattern = re.compile(rf"(?<![\w-]){re.escape(task)}\b")
    lines = git("log", "--reverse", "--no-merges", "--max-count=500", "--format=%H %s", main).splitlines()
    commits = [line.split(" ", 1)[0] for line in lines if pattern.search(line.split(" ", 1)[1])]
    if not commits:
        return [], "", ""
    return commits, f"task/{task}-base", git("rev-parse", f"{commits[0]}^")


def open_here(task: str, branch: str, upstream: str, main: str, options: argparse.Namespace) -> int:
    """This checkout's HEAD (a worktree's own branch) pushed as task/<id>, and its PR."""
    commits = git("log", "--reverse", "--no-merges", "--format=%H", f"{upstream}..HEAD").splitlines()
    if not commits:
        sys.exit(f"task_pr: HEAD has no commit that {upstream} lacks")
    if options.dry_run:
        say(f"dry run: {branch} would be HEAD ({len(commits)} commits)")
        return 0
    git("push", "--quiet", "--force-with-lease", options.remote, f"HEAD:refs/heads/{branch}")
    return update_pr(task, branch, options) if open_url(branch) else create_pr(task, branch, main, commits, options)


def open_url(branch: str) -> str:
    return run("gh", "pr", "view", branch, "--json", "url,state", "-q", 'select(.state=="OPEN") | .url').stdout.strip()


def create_pr(task: str, branch: str, base: str, commits: list[str], options: argparse.Namespace) -> int:
    path = task_file(task)
    shown, attach = video_lines(task)
    body = Path(options.body_file).read_text() if options.body_file else default_body(task, path, commits)
    if is_direct() and not options.here:
        body = REVIEW_NOTE + body
    draft = [] if options.ready else ["--draft"]
    created = run("gh", "pr", "create", "--base", base, "--head", branch, *draft,
                  "--title", f"{task} {task_title(path, task)}", "--body", with_video(body, shown), *attach)
    if created.returncode != 0:
        print(created.stderr.strip(), file=sys.stderr)
        return created.returncode
    if attach:
        show_player(task, branch)
    print(created.stdout.strip().splitlines()[-1])
    return 0


def update_pr(task: str, branch: str, options: argparse.Namespace) -> int:
    """The open PR: a new video in place of the old one, a new description if given, ready if asked. Prints its URL."""
    view = json.loads(run("gh", "pr", "view", branch, "--json", "url,body,isDraft").stdout)
    body = Path(options.body_file).read_text() if options.body_file else view["body"]
    if options.body_file and is_direct() and not options.here:
        body = REVIEW_NOTE + body
    old = VIDEO_BLOCK.search(view["body"])
    is_new_video = video_file(task).exists() and not (old and f"<!-- video {video_id(task)} -->" in old.group(0))
    shown, attach = video_lines(task) if is_new_video else (old.group(0).rstrip("\n").splitlines() + [""] if old else [], [])
    body = with_video(VIDEO_BLOCK.sub("", body), shown)
    if body != view["body"]:
        edited = run("gh", "pr", "edit", branch, "--body", body, *attach)
        if edited.returncode != 0:
            sys.exit(f"task_pr: gh pr edit: {edited.stderr.strip()}")
        if attach:
            show_player(task, branch)
        say("description updated" + (", with the new video" if is_new_video else ""))
    if options.ready and view["isDraft"]:
        run("gh", "pr", "ready", branch)
        say("marked ready for review")
    print(view["url"])
    return 0


def close(task: str, options: argparse.Namespace) -> int:
    """The task closed without a merge: its PR closed, its branches deleted."""
    branch = f"task/{task}"
    note = f"{task} is closed; its commits are on main." if is_direct() else f"{task} is closed without this PR."
    if open_url(branch):
        closed = run("gh", "pr", "close", branch, "--comment", note, "--delete-branch")
        if closed.returncode != 0:
            sys.exit(f"task_pr: gh pr close: {closed.stderr.strip()}")
        say(f"closed the PR of {branch}")
    for name in (branch, f"{branch}-base"):
        if git("ls-remote", "--heads", options.remote, name, ok=True):
            git("push", "--quiet", options.remote, f":refs/heads/{name}")
            say(f"deleted {name}")
    return 0


def sync(options: argparse.Namespace) -> int:
    """After a merge on GitHub: local main follows origin's main, dev takes it in."""
    remote = options.remote
    dev, main = branches(options)
    git("fetch", "--quiet", remote)
    local = git("rev-parse", "--verify", "--quiet", f"refs/heads/{main}", ok=True)
    origin = git("rev-parse", f"{remote}/{main}")
    if local and local != origin:
        if not succeeds("merge-base", "--is-ancestor", local, origin):
            sys.exit(f"task_pr: local {main} has commits {remote}/{main} lacks; land them on {dev} instead")
        if git("symbolic-ref", "-q", "--short", "HEAD", ok=True) == main:
            git("merge", "--ff-only", "--quiet", origin)
        else:
            git("update-ref", f"refs/heads/{main}", origin, local)
        say(f"{main} -> {origin[:8]}")
    tip = git("rev-parse", dev)
    if succeeds("merge-base", "--is-ancestor", origin, tip):
        say(f"{dev} already holds {remote}/{main}")
        return 0
    merged = run("git", "merge-tree", "--write-tree", tip, origin)
    tree = merged.stdout.split("\n", 1)[0]
    if merged.returncode != 0 or tree != git("rev-parse", f"{tip}^{{tree}}"):
        sys.exit(f"task_pr: taking {remote}/{main} in would change files on {dev}: a fix was made on a task "
                 f"branch, not on {dev}? Land the same fix on {dev}, then sync again.")
    commit = git("commit-tree", tree, "-p", tip, "-p", origin, "-m", f"Merge {remote}/{main} into {dev}")
    git("update-ref", f"refs/heads/{dev}", commit, tip)
    say(f"{dev} -> {commit[:8]} (took {remote}/{main} in, no file changed)")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dev", default="", help="the branch the task's commits are on (default: the project's dev branch, or main under straight to main)")
    parser.add_argument("--main", default="", help="the branch PRs go into (default: origin's HEAD branch)")
    parser.add_argument("--remote", default="origin")
    sub = parser.add_subparsers(dest="what", required=True)
    opened = sub.add_parser("open", help="make or extend task/<id> and its draft PR; prints the PR's URL last")
    opened.add_argument("task", help="the task id, e.g. T-004")
    opened.add_argument("--body-file", help="the PR description (default: from the task file and the commits)")
    opened.add_argument("--ready", action="store_true", help="after the user's yes and the full tests: ready to merge, no longer a draft")
    opened.add_argument("--dry-run", action="store_true", help="build the branch, push nothing")
    opened.add_argument("--here", action="store_true", help="push this checkout's HEAD instead of picking commits from dev (the default in a worktree)")
    closed = sub.add_parser("close", help="the task closed without a merge: close its PR, delete its branches")
    closed.add_argument("task", help="the task id, e.g. T-004")
    sub.add_parser("sync", help="after a merge: main follows origin's main, dev takes it in")
    options = parser.parse_args()
    if options.what == "open":
        return open_pr(options.task, options)
    return close(options.task, options) if options.what == "close" else sync(options)


if __name__ == "__main__":
    sys.exit(main())
