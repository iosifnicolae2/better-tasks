---
id: T-087
title: Worktrees share build caches and are cleaned up, for a fast feedback loop
sprint: 2026-10-05
urgent: true
status: todo
owner:
rolled: 0
order: -2
created: 2026-10-07
---
## Goal
User's words: "add also short instructions to try to share build cache between worktrees and also to cleanup them properly to not store waste on disk, make everything efficient so that the feedback loop is fast, do it directly by yourself".

The lead does this one itself, as the user asked. Add short principle-level instructions, per CLAUDE.md:
- A teammate in a worktree reuses the main checkout's build caches and dependencies where the toolchain allows, instead of a fresh install or build.
- Worktrees, scratch captures and build output are removed once a task is finished, so nothing wasteful stays on disk.
- Keep the feedback loop fast: incremental builds, targeted checks first, the full suite at the finish.
Update the tests that check the rules text.

## Notes
