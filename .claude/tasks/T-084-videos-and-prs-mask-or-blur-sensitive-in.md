---
id: T-084
title: Videos and PRs mask or blur sensitive information
sprint: 2026-10-05
urgent: false
status: done
owner: privacy
rolled: 0
order: -3
created: 2026-10-06
---
## Goal
User's words: "also add a small instruction when creating the video or pr to not leak sensitive information, make sure to mask it or blur it..".

Add one short instruction, a principle in a line or two per CLAUDE.md, where teammates make the before/after video and write the PR (the video and pull-request skills, or the teammate rules if that's where it fits once): never show secrets or personal data (tokens, keys, passwords, emails, private paths or customer data) in a video, screenshot or PR text. Mask or blur them before recording or uploading. If the video tooling (demo-video.sh / the spec) already has a way to blur a region, mention it in a few words; don't build new tooling in this task.
Update the tests that check skills or rules text, if any.

This is the user's own repo: commit to main, with a review-only draft PR (no video needed if it's a text-only change; the diff shows it). No release until the user approves. dependencies (T-081) is finishing in the task tools and lead rules; touch only the video and PR instructions.

## Notes
- 2026-10-06: One line each in `.claude/better-tasks/video.md` and `pull-request.md` (no secrets/personal data; test values or covered in the image; masked in PR text). demo-video.sh has no blur, so none mentioned. Tests: 2 lines in tests/rules.test.ts, templates.gen.ts regenerated; `claude plugin test .` 345 pass. Commit a89ed4e. Text-only: no video.
- PR: https://github.com/iosifnicolae2/better-tasks/pull/48

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/48
T-084 (#48) Videos and PRs mask or blur sensitive information
Teammates are now told never to show secrets or personal data in videos or PRs: use test values, or cover/mask them.
- 2026-10-06: The video and PR instructions say never show secrets or personal data: use test values or cover them in the image, and mask them in PR text. 345 tests pass; review PR #48 closed. Not released yet.
