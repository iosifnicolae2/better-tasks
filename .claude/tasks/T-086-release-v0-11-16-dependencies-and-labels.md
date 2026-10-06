---
id: T-086
title: Release v0.11.16 (dependencies and labels, footer, privacy, virtual display)
sprint: 2026-10-05
urgent: true
status: doing
owner: release-6
rolled: 0
order: -5
created: 2026-10-07
---
## Goal
The user approved: "Release tonight", once T-085 (#49)'s full tests pass. Waits on T-085.

1. Pull origin/main first: T-083 (#47) was squash-merged there as 9b64dfa while local main has unpushed commits. Rebase local main on it, then push. Commit the task-board notes first as "Tasks: notes". Leave .claude/tasks/config.json alone: it's the user's own uncommitted change. release.sh refuses to run while it's dirty, so run it from a temporary clean clone of main, as earlier releases did, then fast-forward the shared checkout so .claude-plugin/marketplace.json matches.
2. Run `scripts/release.sh v0.11.16` (see CLAUDE.md). The tag points at a package commit without .claude/tasks; check that `git ls-tree -r --name-only v0.11.16 | grep -c .claude/tasks/` prints 0. Write the notes yourself (notes file as the second argument), each task as "T-0NN (#NN)":
   - T-081 (#46): tasks get labels and dependencies (tasks, several, or a label); the lead starts work in dependency order; the board groups by label with g.
   - T-082 (#45): CLAUDE.md: instructions state only principles, briefly.
   - T-083 (#47): the footer's done count updates as soon as a task changes.
   - T-084 (#48): videos and PRs keep secrets and personal data out.
   - T-085 (#49): the test screen copies the main display's resolution and Retina scaling.
   Keep the release video on.
3. Report the tag, the release URL and the ls-tree check.

## Notes
2026-10-07: rebased on 9b64dfa (clean), 346 tests pass, pushed; released v0.11.16 (cf51f51) with video; ls-tree .claude/tasks count 0. https://github.com/iosifnicolae2/better-tasks/releases/tag/v0.11.16
