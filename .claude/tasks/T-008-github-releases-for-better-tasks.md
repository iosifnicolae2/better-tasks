---
id: T-008
title: GitHub releases for better-tasks
sprint: 2026-09-28
urgent: false
status: done
owner: repo
rolled: 0
order: 0
created: 2026-10-03
---
## Goal
iosifnicolae2/better-tasks gets GitHub releases: one now for the current main (notes since v0.1.0), the v0.1.0 release notes carried over from bringes/supermanager before that repo is deleted, and a simple, documented way to cut a release every time shipped changes land on main.

## Notes
- 2026-10-03: bringes/supermanager was already deleted. v0.1.0 notes recovered word for word from session a969617e (its `gh release create`; title later edited to "v0.1.0"). Recreated on better-tasks with one added line saying the old install link is dead. Not marked latest.
- 2026-10-03: scripts/release.sh <version> [notes.md]: checks main is clean and equals origin/main, the tag is new and something changed since the last tag; then tags (annotated), pushes the tag, runs `gh release create`. Default notes: commit subjects since the last tag (no "Task log:" lines) plus the update commands. `--generate-notes` was not used: it lists PRs, and this repo has none.
- 2026-10-03: v0.2.0 cut with the script and hand-written notes, at 4959bbd. Commits: 4959bbd (script + CLAUDE.md), c95aa8b (nothing-new guard). Checks: 167 tests pass, tsc ok, validate ok.
- 2026-10-03: Releases v0.1.0 (notes carried over) and v0.2.0 on iosifnicolae2/better-tasks; scripts/release.sh cuts the next; CLAUDE.md says to release after shipping to main.
