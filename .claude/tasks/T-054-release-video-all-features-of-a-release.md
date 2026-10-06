---
id: T-054
title: "Release video: all features of a release, before/after vs the last release"
sprint: 2026-10-05
urgent: false
status: done
owner: release-video
rolled: 0
order: -3
created: 2026-10-06
---
## Goal
User's words: "when creating a release to create also a video with all the features from that release with a before and after from last pre-release or production releases.. (make it configurable, by default it will be true)"

What it means:
- When a release is cut, better-tasks makes one video covering every feature shipped since the previous release. Each feature gets a before (the last pre-release or production release) and an after (the new release).
- A new better-tasks setting turns this on or off. It is on by default. Document it with the other settings (see the settings skill) and make it changeable the same way the other settings are.
- Reuse the per-task before/after video machinery (the video skill, demo-video.sh) where it fits. A release video can stitch the tasks' existing videos, or record fresh before/after captures against the two release builds. Pick what gives a correct result and say why.
- Link the video from the release, e.g. in the GitHub release notes.
- This repo's scripts/release.sh is the first place it must work (see CLAUDE.md "Releases").

Done: cutting a release with the setting on produces the video and links it from the release. With the setting off, the release goes out as before.

## Notes
- 2026-10-06: 2026-10-06 release-video: implemented on branch of worktree agent-a8ccc520a82aa07f8; commits 391b448, bbb607d, 10f92f5.
What changed:
- New project setting releaseVideos (default true; config.json only, like offScreen): hooks/settings.ts, settings page row "Release videos" (hooks/configpage.tsx), settings skill regenerated, test in tests/demovideo.test.ts.
- bin/release-video.sh + bin/release_video.py: finds the tasks shipped since the previous tag (commit subjects starting with the task id), takes each task's own before/after video (the project's .claude/tasks_videos, else the better-tasks-videos branch), and joins them behind narrated cards: an opening card (version, "Before: <prev tag> After: <new>", every task, those without a video marked) and a card per task. Poster = opening card + play button. Exit 3 when no task has a video.
- scripts/release.sh: with releaseVideos on, makes the video before committing anything, uploads it with bin/video-branch.sh and opens the notes with a "## Video" section (poster linking to the video). Video fails (e.g. no Kokoro) -> the release stops before any commit/tag/push, saying how to turn it off. No task video -> released without one. New --dry-run: notes + video, nothing published.
- Docs: CLAUDE.md Releases line, README, video skill one line.
Why stitch the tasks' videos instead of fresh captures of the two release builds: each was recorded by the teammate who knew how to reach the feature, and the user accepted it; a script cannot drive an arbitrary app to every feature. Caveat: a task's BEFORE is the code right before that task, i.e. the previous release plus earlier tasks of the same release.
Tested in scratch repos (local bare origin, fake gh): on (video made, uploaded to the scratch videos branch, notes open with it), off (notes as before), dry run (nothing pushed), no task video (released without), no Kokoro (stops before tagging). Full plugin tests: 322 pass.
Not verified: a real GitHub upload (only a local origin); the link text on a real public repo comes from video-branch.sh as for task PRs.
Captures: scratchpad/captures/before-notes.md, after-notes.md; sample video: scratchpad/full/repo/.claude/tasks_videos/release-v0.12.0.mp4

### For the user
Links:
Sample release video: [release-v0.12.0.mp4](file:///private/tmp/claude-501/-Users-iosif-Documents-Projects-better-tasks/53ae7dac-9013-42a3-a974-c8490897e797/scratchpad/full/repo/.claude/tasks_videos/release-v0.12.0.mp4)
Question:
T-054 Release video: all features of a release, before and after
What changed: cutting a release now also makes one narrated video of every task in it, each with its before and after, and puts it at the top of the release notes. A new setting, "Release videos" (on by default), turns it off.
To try it: watch the sample video made from a test release of T-051 and T-052 (link above). To check a real release first without publishing anything: scripts/release.sh --dry-run v0.12.0
Is everything OK?
- 2026-10-06: Video: [T-054.mp4](../tasks_videos/T-054.mp4)
2026-10-06 Finished: full tests pass (322). PR: https://github.com/iosifnicolae2/better-tasks/pull/35 (video attached). Note: task videos attached to PRs through gh's --attach exist only as GitHub attachments, so the release video finds them in the main checkout's .claude/tasks_videos/ (the videos branch is only the fallback). A release cut on another machine would list those tasks as "(no video)".
- 2026-10-06: release.sh makes a narrated video of the release's tasks, each before and after, and opens the notes with it; setting releaseVideos (on by default); --dry-run (PR #35)
