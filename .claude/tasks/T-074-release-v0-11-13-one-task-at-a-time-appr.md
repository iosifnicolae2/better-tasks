---
id: T-074
title: Release v0.11.13 (one-task-at-a-time approval rule)
sprint: 2026-10-05
urgent: false
status: done
owner: release-3
rolled: 0
order: -2
created: 2026-10-06
---
## Goal
User approved: "Push and release" v0.11.13.

1. Push local main to origin. T-073's commits abfe06c and ceb2b4a, plus its task-note commits, are on local main and unpushed. Task-board files may be committed as "Tasks: notes" before the push. Leave .claude/tasks/config.json alone: it's the user's own uncommitted change. release.sh refuses to run while it's dirty, so run it from a temporary clean clone of main, as T-072 did, then fast-forward the shared checkout so .claude-plugin/marketplace.json matches.
2. Run `scripts/release.sh v0.11.13` (see CLAUDE.md), with notes you write yourself (notes file as the second argument) covering T-073: the lead now asks about one finished task at a time, only once its video is in its PR. The question says in a few words what was implemented or fixed, with the PR link (and the release link, if any) above it and inside it. Keep the release video on: T-073 is closed and has a video.
3. Report the tag and the release URL.

## Notes
- 2026-10-06: v0.11.13 published with the release video: https://github.com/iosifnicolae2/better-tasks/releases/tag/v0.11.13
