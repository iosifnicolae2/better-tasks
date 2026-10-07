---
id: T-090
title: Release v0.11.17 (worktree caches and cleanup, task upkeep, tests read the rules)
sprint: 2026-10-05
urgent: false
status: done
owner: release-7
rolled: 0
order: -2
created: 2026-10-07
---
## Goal
The user approved: "Release now" for v0.11.17 with T-087, T-088 and T-089 (#50).

1. Commit the task-board notes as "Tasks: notes", then push main. Pull or rebase first if origin moved. Leave .claude/tasks/config.json alone: it's the user's own uncommitted change. release.sh refuses to run while it's dirty, so run it from a temporary clean clone of main, as earlier releases did, then move the shared checkout to origin/main with `git reset --keep`, so marketplace.json matches.
2. In that clone, run `sh scripts/test.sh` first: T-089 moved the tests there, and the rules copy is no longer committed. Then run `scripts/release.sh v0.11.17` with notes you write yourself, each task by id and PR number:
   - T-087: worktrees reuse the main checkout's build caches; closed tasks' worktrees are removed; a fast loop (narrowest check first, full suite at the finish).
   - T-088: closing a task stops its teammate and removes its worktree and branch in one go; the status check keeps task files current.
   - T-089 (#50): `sh scripts/test.sh` builds the rules copy and runs the tests, so a rule change needs no manual step; docs/instructions.md is rendered on demand.
   Keep the release video on. Check `git ls-tree -r --name-only v0.11.17 | grep -c .claude/tasks/` prints 0.
3. Report the tag, the release URL and the check. Afterwards, remove the temporary clone (no waste on disk).

## Notes
- 2026-10-07: released v0.11.17, https://github.com/iosifnicolae2/better-tasks/releases/tag/v0.11.17; tests 347 pass; ls-tree check 0; no video (no task had one); clone removed.
- 2026-10-07: v0.11.17 published: https://github.com/iosifnicolae2/better-tasks/releases/tag/v0.11.17 (T-087, T-088, T-089 (#50)). No release video, because none of its tasks had one. 347 tests pass via scripts/test.sh; the tag has 0 files under .claude/tasks; the temporary clone is removed.
