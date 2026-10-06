---
id: T-068
title: "Default git flow: a worktree and a PR per task"
sprint: 2026-10-05
urgent: false
status: done
owner: git-flow
rolled: 0
order: -3
created: 2026-10-06
---
## Goal
User's words: "also make worktree and pr per task as default".

Change the better-tasks default git flow so that, when a project has not chosen one, each task gets its own worktree (teammate spawned with isolation "worktree", on its own task branch) and its own PR, which merges after the user approves it. Today's default is "straight to main" (teammates commit to main; the task PR is a review-only draft that never merges).

Scope:
- The default value of the git flow setting (wherever settings defaults live) and the first-start setup question, if it offers a pre-selected/recommended choice: make "worktree + PR per task" the default/recommended one.
- The docs and rules that state the default (settings skill, README, the lead/teammate rules text) so they all say the same thing. Say it once; link elsewhere.
- Projects that already saved a git flow keep it. Do not change this repo's own .claude/tasks/config.json.

This is the user's own repo (iosifnicolae2/better-tasks), so work in it directly, no fork. Shipped changes go out with the next release (scripts/release.sh, see CLAUDE.md).

## Notes
Video: [T-068.mp4](../tasks_videos/T-068.mp4)
PR: https://github.com/iosifnicolae2/better-tasks/pull/38

2026-10-06: Done, commit 11d21d9.
- Default (no gitFlow saved): worktree-prs (`DEFAULT_FLOW` in hooks/gitflow.ts; settings.ts DEFAULTS, settings page, task_pr.py follow).
- No GitHub remote: session start checks `git remote -v` once (state `noGitHub`); a project that chose no flow then reads as direct, since no PR can be opened. Nothing written to config.json.
- Old switches kept: `pullRequests: true` -> worktree-prs, `worktree: true` -> direct. `pullRequests: false` alone can't be told from the plugin default, so it now reads as the new default.
- First-start question: worktree flow listed first, recommended also for solo projects; dev-prs still recommended for an app to install or a >= 2 GB build cache (my call: these keep the earlier cost reasoning; say if the user wants worktree-prs there too).
- Side effect of the worktree flow (existing design): better-tasks no longer self-commits its shared-settings pin in such projects; it says "Commit it yourself."
- Docs: settings skill row, settings page text, README line 17 (git-flow line only).
- Checks: claude plugin test . 320 pass; task-pr-check.sh ok; tsc clean; settings/instructions/templates docs current. Before/after text: scratchpad t068/before.txt, after.txt.
- Not checked: a live Claude Code session in a fresh GitHub project (covered by the core tests' fake host). No draft release: the change ships with the next release as usual.

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/38
T-068 Default git flow: a worktree and a PR per task
A project that never picked a git flow now gives each task its own worktree and PR, merged after you approve it (straight to main only when there's no GitHub remote). The setup question recommends it too; projects that already picked a flow keep theirs.

2026-10-06: Accepted. Full tests pass (320 tests, tsc, task-pr/open-pr/video-branch/skills/yaml checks, docs current). Review PR #38 closed.
- 2026-10-06: Default git flow is now worktree + PR per task (gitFlow "worktree-prs") when a project saved none; straight to main only with no GitHub remote. Setup question recommends it (shared dev branch still for apps / >=2 GB build caches). Saved flows kept; a project with only pullRequests:false now gets the new default. 320 tests pass; review PR #38 closed. Not pushed yet.
