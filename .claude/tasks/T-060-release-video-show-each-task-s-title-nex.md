---
id: T-060
title: "Release video: show each task's title next to its number"
sprint: 2026-10-05
urgent: true
status: doing
owner: release-video-2
rolled: 0
order: -2
created: 2026-10-06
---
## Goal
User (with a screenshot of the v0.11.6 release video): "in the release video display the task number and also the title". The task card shows only "1 of 1" and a big "T-059", with "T-059" again in the corner badge. There is no title.

Done: each task's card in the release video shows the task number and its title, taken from the task file. Long titles wrap or are shortened neatly and stay clear of the poster's play button. Check the corner badge too. Then regenerate the v0.11.6 release video and put it in v0.11.6's notes, with no new tag.

## Notes
Video: [T-060.mp4](../tasks_videos/T-060.mp4)

2026-10-06: Changed bin/release_video.py (435b62a): each task card shows "1 of N", the id, and under it the title from the task file in large type, wrapped word by word to at most 3 lines (the last ends in "…"), as wide as the opening card's lines so it stays clear of the poster's play button. The corner badge on task cards now shows the version (as on the opening card) instead of repeating the id. Checked: a 1920x1080 card with a title too long for 3 lines, a 1280x720 one with a short title, and the full v0.11.6 release video at medium quality.
BEFORE: /private/tmp/claude-501/-Users-iosif-Documents-Projects-better-tasks/53ae7dac-9013-42a3-a974-c8490897e797/scratchpad/t060/before-1.png (frame of the published v0.11.6 video). AFTER: /private/tmp/claude-501/-Users-iosif-Documents-Projects-better-tasks/53ae7dac-9013-42a3-a974-c8490897e797/scratchpad/t060/after-1.png, from the regenerated video /private/tmp/claude-501/-Users-iosif-Documents-Projects-better-tasks/53ae7dac-9013-42a3-a974-c8490897e797/scratchpad/t060/videos/release-v0.11.6.mp4 (made in scratch; the published one is not replaced yet).
Waits for the yes: the v0.11.6 notes edit (regenerate into .claude/tasks_videos, video-branch.sh, gh release edit, no new tag), full tests, this task's video.

### For the user
Question:
T-060 Release video: show each task's title next to its number
What changed: each task's card in the release video now shows its title under its number, and the corner shows the version instead of the number a second time.
To try it: play the new v0.11.6 video at /private/tmp/claude-501/-Users-iosif-Documents-Projects-better-tasks/53ae7dac-9013-42a3-a974-c8490897e797/scratchpad/t060/videos/release-v0.11.6.mp4 and look at the T-059 card.
After your yes I put this video in the v0.11.6 release notes (same release, no new tag).
Is everything OK?
- 2026-10-06: User replied to T-060's approval question with a general request, filed as T-061: every approval links the PR and the release, with the video inside them. For T-060 itself: put the new release video into the v0.11.6 notes now, so the user can check it in the release before approving. Then the lead asks again with the release link.
- 2026-10-06: The new release video is in v0.11.6's notes (gh release edit, same tag): https://github.com/iosifnicolae2/better-tasks/releases/tag/v0.11.6 . Video and poster on better-tasks-videos (c227eb5); both links answer 200. Still after the yes: full tests and this task's video.

### For the user
Links:
Release: [v0.11.6](https://github.com/iosifnicolae2/better-tasks/releases/tag/v0.11.6)
Question:
T-060 Release video: show each task's title next to its number
What changed: each task's card in the release video now shows its title under its number, and the corner shows the version instead of the number a second time.
To try it: open the release and play its video; look at the T-059 card.
https://github.com/iosifnicolae2/better-tasks/releases/tag/v0.11.6
Is everything OK?
- 2026-10-06: Finished: full tests pass (316), plus settings-doc --check and skills-check. Video made from the published v0.11.6 card (before) and the regenerated one (after). v0.11.6 notes already carry the new release video. Straight to main: commit 435b62a is final (not pushed; the next release ships it).
