---
id: T-030
title: "Better video picture: labeled before/after, showing the most important thing solved"
sprint: 2026-10-05
urgent: false
status: done
owner: skills
rolled: 0
order: -11
created: 2026-10-05
---
## Goal
User's words: "also the screen shot should be better, say before/after and use in the screenshto the most important thing that was solved"

Context: each task video has a poster picture (.claude/tasks_videos/<id>.png) shown in the PR and linking to the video; today it's an AFTER frame with a big play button (bin/demo_video.py, the video rules, now moving into the better-tasks:video skill in T-028).

Goal: the picture clearly says BEFORE and AFTER (e.g. side by side, each labeled), and each half shows the most important thing the task solved: the teammate picks the frame (or crops/zooms to the region) where the difference is clearest, not just the last frame. Keep the play button so it still reads as a video. Readable at PR width.

Done: a real task's poster made the new way; explain how the teammate chooses the frame and how to check.

## Notes
- 2026-10-05: Video: [T-030.mp4](../tasks_videos/T-030.mp4)
PR: https://github.com/iosifnicolae2/better-tasks/pull/13
(skills) Done. Commit 68bda95 on task/T-030 (from main 012c10d).
- What changed: bin/demo_video.py's poster now puts BEFORE and AFTER side by side, each labeled above and its sentence under it, with the play button in the gap between them (it covers neither half). Each half zooms on what changed. Panels take the frame's shape (3:4 to 16:9); a single clip gets 16:9.
- How the teammate picks the frame: in the BEFORE clip and in the AFTER clip it marks the step where the difference shows clearest with "poster": true, plus "focus": [x, y, w, h] around that spot, best the same spot in both, a third to half of the frame wide. Without them: the last step with a box, zoomed on its marks with room around them (at least a third of the frame wide). The video skill says this, and says to open the poster to check that both halves show the difference and their text reads at half size.
- Real posters made the new way: T-028's (scratchpad t030/after-poster.png, the two word counts zoomed) and T-030's own (.claude/tasks_videos/T-030.png). Checked: portrait, a single clip, a video clip, a step without marks.
- Tests: claude plugin test . 272 pass, skills-check clean. No automated test for the Python poster code (the test runner is TypeScript only); the edge cases ran as a scratch script (t030/edge.py).
- Also: .gitignore now ignores __pycache__/ (running the script made bytecode files in bin/).

### For the user
Links:
[PR #13](https://github.com/iosifnicolae2/better-tasks/pull/13)
Question:
T-030 Better video picture: labeled before/after
What changed: a PR's video picture now shows BEFORE and AFTER side by side, each labeled and zoomed on what the task changed, with the play button between them.
To test: open the PR and look at its picture, then click it to play the video.
https://github.com/iosifnicolae2/better-tasks/pull/13
Is everything OK?
- 2026-10-05: User (Request changes, after seeing PR #13): "update also the demo before/after to use the new thing, optimize it so that it's easy to understand.. with a sample use-case..". So: remake T-030's own before/after video and picture with the new labeled poster, on a simple sample use-case anyone gets at a glance (e.g. a small app with a visible bug, BEFORE broken, AFTER fixed), not prompt/word-count internals. Also update any demo of better-tasks that shows before/after (README picture/video, docs/screenshots) to the new style with the same kind of sample. Push to PR #13; tell the lead only once the video and picture are uploaded and show in the PR.
- 2026-10-05: User: "also, remove that title and waiting.. go directly into the before and after thing..". So the demo videos (bin/demo_video.py / the video skill) drop the opening title card and any waiting/pause at the start: the video starts straight on BEFORE, then AFTER.
- 2026-10-05: (skills) Request changes done, pushed to PR #13: https://github.com/iosifnicolae2/better-tasks/pull/13 (commits 68bda95, cbe445b, f3d12df).
- Sample use-case: a small shop page ("Bean Shop") whose "Add to cart" button lost every click. BEFORE: three clicks, "Cart: 0". AFTER: "Cart: 3". Captured off-screen (headless Chromium).
- T-030's own video and picture remade on that sample: BEFORE = the old-style picture (one frame labeled AFTER, yet showing "Cart: 0", the play button over the button); AFTER = the new picture (BEFORE and AFTER side by side, zoomed on the cart). Uploaded to PR #13; the picture loads (checked logged out, 200). The video link answers 404 to a logged-out curl, the same as PR #12's video, which played for the user, so it only opens for a signed-in viewer.
- Videos start straight on BEFORE: no title card, no pause before the first sentence (cbe445b). A 0.6 s pause stays before the AFTER clip talks, so the cut registers.
- README demo (f3d12df): docs/videos/sample-before-after.mp4 and .png, the shop sample with the new picture; the old demo files are removed. Its video link is jsDelivr @main, so it works once merged (a new file name, so no stale cache).
- Tests: claude plugin test . 272 pass, skills-check clean.

### For the user
Links:
[PR #13](https://github.com/iosifnicolae2/better-tasks/pull/13)
Question:
T-030 Better video picture: labeled before/after
What changed: the video picture now shows BEFORE and AFTER side by side, zoomed on what changed, shown on a simple shop sample where "Add to cart" was broken. Videos start right on BEFORE, with no title or pause. The README demo uses the same sample.
To test: open the PR, look at its picture, click it to play the video.
https://github.com/iosifnicolae2/better-tasks/pull/13
Is everything OK?
- 2026-10-05: Video picture shows BEFORE and AFTER side by side, labeled and zoomed on what changed; videos start straight on BEFORE; README demo remade on a simple shop sample.
- 2026-10-05: User, after release v0.9.0: the README demo video link https://cdn.jsdelivr.net/gh/iosifnicolae2/better-tasks@main/docs/videos/sample-before-after.mp4 shows "backend read error". Find why (jsDelivr's file-size limit for GitHub files, a stale @main cache, LFS, the file's path/branch), fix it so the README video plays from a click, and check it logged out in a browser. If jsDelivr can't serve it, pick a host that can (e.g. a GitHub release asset) and update the README and the video skill's guidance if the same issue can hit task videos (T-019's video branch also uses jsDelivr).
- 2026-10-05: User: "after a few refreshed it was working..". The "backend read error" was jsDelivr fetching the new file from GitHub the first time; nothing to fix. Closed again.
- 2026-10-05: Video picture shows BEFORE and AFTER side by side, labeled and zoomed on what changed; videos start straight on BEFORE; README demo on a simple shop sample (jsDelivr link works once its cache warms).
