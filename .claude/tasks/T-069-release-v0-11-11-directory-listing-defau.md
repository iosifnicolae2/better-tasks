---
id: T-069
title: Release v0.11.11 (directory listing + default git flow)
sprint: 2026-10-05
urgent: false
status: done
owner: release
rolled: 0
order: -2
created: 2026-10-06
---
## Goal
User approved: "Push and release" v0.11.11.

1. Push local main to origin (commits from T-067 and T-068 are on local main, unpushed). Leave .claude/tasks/config.json alone (the user's own uncommitted change); task-board files (.claude/tasks/T-067*.md, T-068*.md, docs/tasks.md) may be committed as "Tasks: T-067, T-068 closed" before the push.
2. Run `scripts/release.sh v0.11.11` (see CLAUDE.md). Release notes: write them yourself (notes file as second argument) covering T-067 (plugin.json listing fields; README "What it runs, reads and sends" + support) and T-068 (default git flow is now a worktree and a PR per task; straight to main only without a GitHub remote). Include this line: a project that only set `pullRequests: false` now gets the new default; save `gitFlow: "direct"` to stay on main.
3. Report the release URL. After this release the user submits better-tasks to the plugin directory with .claude/tasks/T-067/submission.md.

## Notes
- 2026-10-06: v0.11.11 published with the release video: https://github.com/iosifnicolae2/better-tasks/releases/tag/v0.11.11. Run from a temporary clean worktree because the user's config.json had uncommitted changes (left untouched).
