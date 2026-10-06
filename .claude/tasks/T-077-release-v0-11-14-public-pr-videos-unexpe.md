---
id: T-077
title: Release v0.11.14 (public PR videos + unexpected-bugs rule)
sprint: 2026-10-05
urgent: false
status: done
owner: release-4
rolled: 0
order: -2
created: 2026-10-06
---
## Goal
The user approved one release with T-075 and T-076 once T-076 was approved, which it now is.

1. Push local main to origin. Unpushed: c77d714 and 444f922 (T-075), 46b8e49 (T-076), plus any task-board notes. Commit those first as "Tasks: notes". Leave .claude/tasks/config.json alone: it's the user's own uncommitted change. release.sh refuses to run while it's dirty, so run it from a temporary clean clone of main, as T-072 and T-074 did, then fast-forward the shared checkout so .claude-plugin/marketplace.json matches.
2. Run `scripts/release.sh v0.11.14` (see CLAUDE.md), with notes you write yourself (notes file as the second argument):
   - T-075: PR videos open for anyone in a public repo and only for members in a private one. They're uploaded with gh and also shown as a player, the way github.com does it. Before, a gh-attached video linked only behind its picture gave signed-out visitors a 404. Older PRs keep their old links.
   - T-076: a teammate fixes a small bug in its own area within its task. A bigger or other-area bug is asked as "New task" / "Skip".
   Keep the release video on: both tasks are closed and have videos.
3. Report the tag and the release URL.

## Notes
- 2026-10-06: v0.11.14 published with the release video: https://github.com/iosifnicolae2/better-tasks/releases/tag/v0.11.14 (T-075 public PR videos, T-076 unexpected-bugs rule).
