---
id: T-078
title: Keep the task board (.claude/tasks) out of the published plugin
sprint: 2026-10-05
urgent: true
status: doing
owner: packaging
rolled: 0
order: -2
created: 2026-10-06
---
## Goal
The user chose "New task" on: "The task board (.claude/tasks, with its screenshots) ships inside the published plugin, and the directory scan reads it. File a task to keep it out?"

Context: the plugin directory portal's scan of v0.11.12 read the repo's task files, e.g. .claude/tasks/T-070/validation-blocked.jpg, adding image findings to the policy holds (see .claude/tasks/T-070/validation.md). Installs get the repo at the release tag (.claude-plugin/marketplace.json `github` source + `ref`), so everything in the repo ships, including .claude/tasks and probably .claude/tasks_videos.

Do:
1. Find out what installs and the directory actually receive (the whole repo at the tag, or a subset), and whether Claude Code plugins or the directory support excluding paths (e.g. a `files`/ignore field, a subdirectory as the plugin root, a separate release branch or archive). Use current docs (Context7 / claude-code-guide), not memory.
2. Pick the simplest way to keep .claude/tasks (and other dev-only files like tasks_videos, if safe) out of what installs and the directory get. The board must keep working in this repo for development, and release.sh must keep working.
3. Show it: what an install gets before and after.

This is the user's own repo (iosifnicolae2/better-tasks): work in it directly, committing to main, with a review-only draft PR and a video. No release until the user approves. Small bugs in your own area: fix them in this task. Bigger or other-area ones: report them to the lead.

## Notes
- 2026-10-06: Docs (code.claude.com marketplace-reference, plugins/loading; claude.com/docs/plugins/submit): a `github` source copies the whole repo at `ref` (no ignore file or `files` field exists); `git-subdir` takes only a folder; the directory scans the plugin path at its tracked branch or tag. BEFORE ([before.txt](T-078/before.txt)): a real install of v0.11.14 has 220 files, 84 of them .claude/tasks (616K, incl. T-070/validation-blocked.jpg).
- 2026-10-06: Fix in scripts/release.sh: the tag now names a package commit, main's release commit minus `DEV_ONLY` (.claude/tasks, .claude/tasks_videos), its child off main, built in a temporary index (the shared checkout is untouched). `previous` = newest v* tag by version (not `git describe main`, which can't see a tag off main); "nothing new" = empty previous..main. Board and .claude/better-tasks (runtime templates) stay. AFTER ([after.txt](T-078/after.txt)): release.sh v0.11.15 in a test clone with a local origin and stubbed gh, then claude plugin install: 136 files, no .claude/tasks, plugin enabled; a second --dry-run v0.11.16 lists only the new commit. The directory submission must track the tag (as for v0.11.11), not main.
