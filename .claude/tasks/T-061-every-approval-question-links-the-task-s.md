---
id: T-061
title: Every approval question links the task's PR and release, with the video inside
sprint: 2026-10-05
urgent: false
status: done
owner: approval-flow
rolled: 0
order: -3
created: 2026-10-06
---
## Goal
User's words, while approving T-060: "also, make sure that in each appproval you link the pr and the release and inside them i can check the video (so make sure to generate it if enabled..)"

What it means for better-tasks' flow (the lead and teammate templates in .claude/better-tasks/, the done, video and pull-request skills, and the scripts behind them):
- When a teammate reports done and the lead asks the user to approve, the question links the task's PR. The PR already holds the before/after video, generated whenever videos are on.
- When the task touches a release, the question also links that release, and its notes hold the release video.
- So the video and PR (a draft PR is fine) come before the approval question, not after the yes. The full tests and final checks still come after the yes.
- It must also work under the straight-to-main git flow: the user wants a PR link to check the video in every approval.

Done: the instructions say this, the scripts support it with defaults, the tests pass, and a sample approval question shows a PR link and, where relevant, a release link, each with a playable video.

## Notes
Video: [T-061.mp4](../tasks_videos/T-061.mp4)
- 2026-10-06: Done (commits 0767ecb, 53ec53e; release.sh --draft is release-video-2's 7c1c8ea). What changed:
  - Templates (lead, teammate, done, pull-request, video): before the approval question, the teammate opens the task's PR as a draft with the video in it, plus a draft release when the task changes a release. The question links both. The full tests come after the yes, then the PR is marked ready (PR flows) or the review PR is closed (straight to main). The "For the user" block now starts with `PR:` and `Release:` lines.
  - Straight to main: the PR is a review-only draft into `task/<id>-base` (the commit before the task's first), so it shows the task's changes alone and never merges. `task_pr.py close <id>` closes it and deletes both branches.
  - bin/task_pr.py: drafts by default, `--ready`, `close`, the PR URL printed last, the flow read from config.json, `--here` automatic in a worktree. Running `open` again replaces a new video in the PR (a `<!-- video <sha> -->` marker says which one it shows).
  - hooks/rules.ts: `hasPr` became `isReviewPr`. Skill descriptions updated; docs/instructions.md and tests/templates.gen.ts regenerated.
  - Checks: `sh scripts/task-pr-check.sh` ok (new; scratch repo plus a stand-in gh). `claude plugin test .`: 316 pass. tsc clean. instructions-doc and templates `--check` are current.
  - Real test: PR #36 opened as a draft review PR with 16 files, T-061's changes only, into task/T-061-base. Running open twice put the video in, then replaced it with a newer one; the body has one video block, and jsDelivr serves it as video/mp4.
  - Not done: a sample release link. I asked release-video-2 for a draft release URL from `scripts/release.sh --draft`; no answer yet, so the video's sample question shows the Release line as a placeholder. This project's CLAUDE.md "Releases" line could mention `--draft` for approvals (the lead's file).
  - 2026-10-06: release-video-2 has no real draft release: --draft was tested only with a fake gh, and the real gh lookup of a draft by its tag name is untested. A real sample needs the user's OK, because it creates a draft release and uploads its video on iosifnicolae2/better-tasks. If the user agrees, release-video-2 runs `scripts/release.sh --draft v0.11.7` and the URL goes in the Release line.
  - 2026-10-06: Finished. Full tests pass: plugin test 316, tsc, the task-pr, video-branch and open-pr checks, skills-check, and the settings/templates/instructions `--check`. Review PR #36 closed with `task_pr.py close T-061`, and both task branches deleted on origin.
  - The installed 0.11.1 skills still describe the old flow until the user runs /reload-plugins on the linked install.

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/36
T-061 Every approval links the task's PR and release
What changed: before you're asked to approve a task, its pull request is opened as a draft with the before/after video at the top. The question links it, and links the release too when the task changes one, with the release video in its notes. Under straight to main the PR is only for review: it never merges and closes with the task.
To try it: open the PR link and play the video. After /reload-plugins, the next approval question will have its PR link.
Is everything OK?
- 2026-10-06: User accepted T-061, and said no to creating a real draft release v0.11.7 now. Keep the placeholder; --draft gets its first real test at the next real release.
- 2026-10-06: Approval questions link the task's draft PR (video inside; review-only under straight to main) and, when a release is touched, a draft release with its video; tests and PR checks after the yes; release.sh --draft
