---
id: T-059
title: Release video skips tasks committed straight to main (v0.11.5 went out without one)
sprint: 2026-10-05
urgent: true
status: doing
owner: release-video-2
rolled: 0
order: -2
created: 2026-10-06
---
## Goal
Found while cutting v0.11.5 (2026-10-06). `scripts/release.sh v0.11.5` printed "release-video: no task since v0.11.4 has a video (0 shipped)" and published without a video. Yet T-058 shipped in it, its video is at .claude/tasks_videos/T-058.mp4, and its task file links it ("Video: [T-058.mp4](../tasks_videos/T-058.mp4)").

Likely cause (unverified): bin/release_video.py finds a release's tasks only from PR merge commit subjects ("T-054 … (#35)"). Under the straight-to-main git flow, commits end in "(T-058)" and there is no PR.

The user said to file it. Done:
- The release video finds every task shipped since the last tag, in both git flows. The before/after video shows the detection before and after.
- Afterwards, add the T-058 video to the v0.11.5 release notes, with gh release edit. Don't make a new tag for it.

## Notes
Video: [T-059.mp4](../tasks_videos/T-059.mp4)

2026-10-06: Cause confirmed: shipped_tasks() matched only subjects that start with a task id (PR merges). Fixed in bin/release_video.py (ead2087): a subject ending in "(T-058)" or "(T-058, T-059)" names its tasks too; "Tasks: T-058 done" names none; the title comes from the task file's front matter, else the subject. The opening card's task lines now stop before the poster's play button (long file titles ran under it). scripts/release.sh and release-video.sh needed no change.
Checked: v0.11.4..v0.11.5 finds T-058, T-055 (before: 0 shipped, exit 3); v0.11.0..v0.11.2 (PR flow) still finds T-050, T-051; v0.11.3..v0.11.4 finds T-053, T-054, T-055, T-057; scratch repo with mixed subjects in /private/tmp/claude-501/-Users-iosif-Documents-Projects-better-tasks/53ae7dac-9013-42a3-a974-c8490897e797/scratchpad/t059/repo. v0.11.5's video made at low quality: /private/tmp/claude-501/-Users-iosif-Documents-Projects-better-tasks/53ae7dac-9013-42a3-a974-c8490897e797/scratchpad/t059/videos/release-v0.11.5.mp4 (76 s, T-058 shown, T-055 "no video"), poster .png next to it. BEFORE/AFTER terminal captures: /private/tmp/claude-501/-Users-iosif-Documents-Projects-better-tasks/53ae7dac-9013-42a3-a974-c8490897e797/scratchpad/t059/before.ansi, /private/tmp/claude-501/-Users-iosif-Documents-Projects-better-tasks/53ae7dac-9013-42a3-a974-c8490897e797/scratchpad/t059/after.ansi (tmux session t059).
Not done yet (waits for acceptance): the v0.11.5 notes edit (gh release edit, video via video-branch.sh, no new tag); the video for this task.
Local build: the user's linked install runs this checkout; to try: bin/release-video.sh --version v0.11.5 --since v0.11.4 --until v0.11.5 --quality low (writes release-v0.11.5.mp4/.png into .claude/tasks_videos, git-ignored; delete them to undo).

### For the user
Question:
T-059 Release video skips tasks committed straight to main
What changed: the release video now finds tasks committed straight to main, not only merged pull requests. For v0.11.5 it finds T-058 (with its video) and T-055 (no video), where before it found none.
To try it: in better-tasks, run bin/release-video.sh --version v0.11.5 --since v0.11.4 --until v0.11.5 --quality low and play the video it prints.
After your yes I add this video to the v0.11.5 release notes (same release, no new tag).
Is everything OK?

2026-10-06: Finished: full tests pass (315), plus settings-doc --check, skills-check, video-branch-check. Also fixed the opening sentence for one video ("Here is the one with a video", 3cb600d). v0.11.5 notes now open with the release video (gh release edit, same tag): https://github.com/iosifnicolae2/better-tasks/releases/tag/v0.11.5 ; video and poster on better-tasks-videos (14d524a). Straight to main: commits ead2087, 3cb600d are final (not pushed; the next release ships them).
