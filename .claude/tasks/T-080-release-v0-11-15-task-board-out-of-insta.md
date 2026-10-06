---
id: T-080
title: Release v0.11.15 (task board out of installs + task numbers with PR)
sprint: 2026-10-05
urgent: false
status: done
owner: release-5
rolled: 0
order: -2
created: 2026-10-06
---
## Goal
The user approved one release with T-078 (#43) and T-079 (#44) once T-079 was approved, which it now is.

1. Push local main to origin (T-078 and T-079 commits plus task-board notes; commit those first as "Tasks: notes"). Leave .claude/tasks/config.json alone: it's the user's own uncommitted change. release.sh refuses to run while it's dirty, so run it from a temporary clean clone of main, as T-072, T-074 and T-077 did, then fast-forward the shared checkout so .claude-plugin/marketplace.json matches.
2. Run `scripts/release.sh v0.11.15` (see CLAUDE.md). This is the first release with T-078's change, so the tag points at a package commit without .claude/tasks. Afterwards check `git ls-tree -r --name-only v0.11.15 | grep -c .claude/tasks/` prints 0, and that marketplace.json on main points at v0.11.15. Notes you write yourself (notes file as the second argument):
   - T-078 (#43): installs and the plugin directory no longer get the task board: the release tag points at a copy without .claude/tasks and the task videos (220 files down to 136).
   - T-079 (#44): tasks with a PR are named "T-078 (#43)" everywhere the user reads.
   Keep the release video on.
3. Report the tag, the release URL and the ls-tree check.

## Notes

- 2026-10-06: released v0.11.15 (https://github.com/iosifnicolae2/better-tasks/releases/tag/v0.11.15); tag has 0 .claude/tasks files, 136 total; marketplace.json on main at v0.11.15.
- 2026-10-06: v0.11.15 published with the release video: https://github.com/iosifnicolae2/better-tasks/releases/tag/v0.11.15 (T-078 (#43), T-079 (#44)). The tag has 136 files and 0 under .claude/tasks.
