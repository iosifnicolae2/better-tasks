---
id: T-085
title: Virtual display matches the real displays' resolution and scaling
sprint: 2026-10-05
urgent: true
status: doing
owner: virtual-display
rolled: 0
order: -4
created: 2026-10-06
---
## Goal
User's words: "also, update the virtual display to match the same resolution configuration and scaling of the other real displays so that everything looks similar".

The virtual display better-tasks creates (the off-screen test screen teammates record on, and /away's helper; see bin/ and the testing skill) should take its resolution, pixel density (Retina/HiDPI scaling) and "looks like" size from the user's real displays, e.g. the main display, so apps, text and recordings look the same as on the user's screen. Say which real display it follows when there are several, and the fallback when it can't read them. Show it before and after: the virtual display's mode vs the real one's (e.g. system_profiler SPDisplaysDataType or CoreGraphics), and a frame from a test recording.

Creating or changing a virtual display can disturb the user's screen arrangement. Ask the lead before anything that might show on or rearrange the user's screens.

This is the user's own repo: commit to main, with a review-only draft PR and a video. No release until the user approves. Small bugs in your area: fix them here. Bigger or other-area ones: report them to the lead.

## Notes

- 2026-10-06: before: main display LG ULTRAFINE 3840x2160 looks like 1920x1080 (2x); helper makes 1920x1080 at 1x, 0.28 mm/px. Asked lead before creating displays. HEAD helper copy: scratchpad before-bin/.
- 2026-10-06: Blocked: the Mac's disk is full (119 MB free). The user is freeing space themselves. The virtual display (id 65) is still added; remove it with `sh bin/record-display.sh remove` once there's space. Done so far: the display copies the main LG (1920x1080 at 2x). Left: making a new display actually switch to 2x. Nothing committed yet.
- 2026-10-06: after: display copies the main screen (LG ULTRAFINE, 1920x1080 at 2x, its mm per pixel); a kept display with another look is made anew. The keeper process sees no modes for its own display, so `fit` (separate process) switches it to 2x; tested from a remembered 1x. Screens back in place after each remove. Disk was full for a while (not mine).
