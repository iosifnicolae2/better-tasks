---
id: T-011
title: Before/after demo videos with narration and red markers
sprint: 2026-09-28
urgent: false
status: done
owner: demo-videos
rolled: 0
order: 0
created: 2026-10-04
---
## Goal
User's request (verbatim): "create a config to create videos before and after, make sure to add in the top left corner (before and after), then record using a screen recorder, playwright or what the project supports, then add subtitles narated using https://github.com/hexgrad/kokoro make sure to setup it globaly if the thing is enabled.. make sure to use arrows and rectagnels which are red and exemplify the bug, feature and so on.. make it easy to understand and intuitive; on startup ask the user if he wants to enable this feature, recommend them to enable it"

What this means for the better-tasks plugin:
- A config setting (in the better-tasks config, /better-tasks config) that turns on "before/after videos" for finished tasks.
- When on: a teammate records a BEFORE clip (the bug / missing feature) and an AFTER clip (the fix / new feature), using whatever the project supports (Playwright for web, the mobile MCP screen recording for iOS/Android, macOS screen recorder otherwise).
- Each clip has a "BEFORE" / "AFTER" label in the top-left corner.
- Red arrows and red rectangles point at what changed (the bug, the feature).
- Subtitles plus spoken narration, voice made with Kokoro TTS (https://github.com/hexgrad/kokoro). Kokoro is installed globally (once per machine, not per project) only when the setting is enabled.
- Goal: easy to understand and intuitive for the user reviewing the task.
- On startup (session start), if the setting was never chosen, ask the user whether to enable it, recommending "enable".

Done looks like: setting exists and is asked about on startup; enabling it sets up Kokoro globally; the teammate rules tell teammates to produce the before/after video and the lead shows it in the Finishing question; one real end-to-end sample video made and its path noted in this task file.

## Notes
Video: [T-011.mp4](../tasks_videos/T-011.mp4)
- 2026-10-04: demo-videos: done, waiting for the user's review.

What I built:
- Setting "Before/after videos" (`demoVideos`, off by default). It's in /better-tasks config (Team group), in Claude Code's /config, and in config.json.
- Startup question: the first interactive start with teams on asks once: "Enable (recommended)" or "Not now". If the dialog is dismissed, it asks again next session. Enable turns the setting on and sets up the voice.
- Voice setup: `bin/kokoro-setup.sh` installs Kokoro once per machine in `~/.local/share/better-tasks/kokoro` (Python 3.12 venv made with uv; the model is cached by Hugging Face). It runs when the setting is turned on (from the question, /config or the settings page), and at startup if the setting is on but the voice isn't ready. Toasts show when it starts and when it is done or fails.
- Video maker: `bin/demo-video.sh spec.json` takes a BEFORE clip and an AFTER clip (screen recordings or screenshots) and makes one mp4: a title card, a BEFORE/AFTER label top-left, red boxes and arrows, burned-in subtitles, and the subtitles read aloud by Kokoro. The spec format is at the top of `bin/demo_video.py`. Drawing is done with Pillow because this ffmpeg build has no subtitles/drawtext filters.
- Rules: while the setting is on, teammates are told to capture BEFORE before changing anything, capture AFTER, write the spec, run the script, and put "Demo video: <path>" in their notes. The lead opens the video (`open <path>`) before the Finishing question and puts the path in it.
- README line, plus the README settings picture regenerated with the new row.

Commits: 4a876c9, 06c249f, d28d41b, 383f88f.

How to try it:
1. Update/reload the plugin, then start Claude Code in a project. The question "Make a short before/after video…" appears: pick "Enable (recommended)".
2. Wait for the toast "Kokoro voice ready" (a few minutes the first time, about 1 GB).
3. Give the team a small UI task. When it reports done, the lead opens the video and asks you to review it.
Needs `ffmpeg` and `uv` (both already on this Mac: `brew install ffmpeg uv` elsewhere).

Sample (real, made by the tool): /private/tmp/claude-501/-Users-iosif-Documents-Projects-better-tasks/3d20d9c3-b53b-4369-b351-3acdb6fbfa22/scratchpad/sample/T-011-before-after.mp4 (28 s; the settings page before and after this change). Spec next to it: spec.json.

Checks: `claude plugin test .` 182 pass, 0 fail (new tests: startup question → setting on → setup runs; rules reach teammates and the lead). `tsc -p .` clean.

Not verified / side effects:
- I did not see the startup dialog in a live Claude Code session, only in the test engine.
- I did not run a full teammate cycle (record → video → Finishing) in a real session.
- Testing installed Kokoro into the scratchpad, not into ~/.local/share. The real install runs when the user enables the setting; it reuses the uv and Hugging Face caches, so it should be quick.
- The setup ran `brew install espeak-ng` on this Mac (needed: the espeak-ng bundled with Kokoro's misaki is broken on macOS, so the script uses the system one).
- Upstream fixes in the setup: a `transformers>=4.40` floor (without it, the resolver picks a 2021 release that doesn't build), and VIRTUAL_ENV is set so spaCy can install its English model.
- The sample lives in /private/tmp, which macOS clears on reboot. Copy it out to keep it.
- 2026-10-04: User review (request changes): "make sure to add this video also in the readme.md describing the feature". So: put the sample before/after video into the repo (it currently lives in /private/tmp, which macOS clears on reboot) and show it in README.md in the section that describes the feature. GitHub READMEs don't play a committed .mp4 inline; a common fix is a GIF preview or a poster image that links to the mp4. Pick what actually plays or shows on GitHub.
- 2026-10-04: demo-videos: the sample video is now in the README (commit 7488a37).
- The video is saved in the repo at docs/videos/before-after.mp4, so the reboot problem is gone.
- In README.md, under "Use", the "Before/after videos" bullet shows a poster: docs/screenshots/before-after.png, a BEFORE frame and an AFTER frame side by side with a play button. Clicking it opens the mp4, which GitHub plays with sound in its file view. A README can't play a committed mp4 inline; only videos uploaded through GitHub's web editor do that.
- To test: after the push, open the README on GitHub, click the picture, and the video plays. Locally: `open docs/videos/before-after.mp4`.
- Not verified: how it looks on GitHub. It isn't pushed yet; the lead/release handles that.
- Note: the plugin install now carries the extra 0.9 MB (mp4 + poster).
- 2026-10-04: User review (request changes): "no, don't include it in readme.md.. but add instruction to add the video path in the approval question.. so clicking it open the video fast". So: 1) Undo the README video: take the poster and link out of README.md, and remove docs/videos/before-after.mp4 and docs/screenshots/before-after.png from the repo (revert 7488a37). 2) Change the lead's rule for the Finishing (approval) question: when a task has a demo video, the question shows the video's full absolute path on its own line, so the user can click it in the terminal and the video opens right away. Make sure the path is one the terminal shows as clickable (absolute, no wrapping, no quotes or backticks around it).
- 2026-10-04: demo-videos: README video taken out; the approval question now carries a clickable video link. Commits: 517b228 (reverts 7488a37), b328c49.
- README.md is back to the text-only bullet. docs/videos/before-after.mp4 and docs/screenshots/before-after.png are gone from the repo.
- New lead rule (Finishing): when the notes hold "Demo video: <absolute path>", the question shows it on a line of its own as file://<absolute path>, with nothing else on that line (no quotes, backticks or punctuation). The user clicks it and the video opens. The lead no longer opens the video itself.
- Why file:// and not the bare path: macOS Terminal only makes URLs clickable; iTerm2, VS Code and JetBrains terminals open file:// links too. The full absolute path is still in the link.
- Teammate rule: the "Demo video:" path must be absolute with no spaces, so it stays one link.
- To test: turn videos on, finish a small UI task, and click the file:// line in the approval question; the video opens. Tests: 182 pass, 0 fail; tsc clean.
- Not verified: clicking it inside a live approval dialog. That needs a real session; I can't drive the terminal UI.
- The sample is only in the scratchpad again (cleared on reboot): file:///private/tmp/claude-501/-Users-iosif-Documents-Projects-better-tasks/3d20d9c3-b53b-4369-b351-3acdb6fbfa22/scratchpad/sample/T-011-before-after.mp4
- 2026-10-04: User review (request changes): "make sure the link is clikable and don't break on two rows and it's not fully clickable..". What happened: the file:// link to the scratchpad video (about 150 characters) wrapped onto two rows in the approval question, and only part of it was clickable. Fix: make the link short enough to fit on one row of a normal terminal (aim for under about 60 characters), e.g. save or copy each finished video to a short fixed place such as ~/.local/share/better-tasks/videos/T-011.mp4 → file:///Users/<user>/bt/T-011.mp4 or similar; pick what keeps it short and also survives reboot. Check the length the rule actually produces, and test it on the real sample.
- 2026-10-04: demo-videos: the link now fits on one row. Commit 106127f.
- Cause: the video sat in the scratchpad, so its file:// link was about 150 characters and wrapped.
- Fix: bin/demo-video.sh now saves every video to ~/Movies/better-tasks/<task id>.mp4. That's outside the project, survives reboots, and a newer video for the same task replaces the old one. The script prints the file:// link. The spec's "output" became "name" (e.g. "T-011.mp4"); BETTER_TASKS_VIDEOS overrides the folder.
- Rules: teammates put the printed link into "Demo video: …" exactly as printed. The lead copies that link as is onto its own line in the approval question.
- Measured on the real sample: 49 characters, fits on one row.
- New sample link: file:///Users/iosif/Movies/better-tasks/T-011.mp4
- To test: click the link above (or the one in the next approval question); the video should open. Tests: 182 pass, 0 fail; tsc clean.
- Not verified: the click inside a live approval dialog (needs a real session).
- 2026-10-04: User review (request changes): "try to store the videos in tasks_videos in .claude inside the project". So: save videos to <project>/.claude/tasks_videos/<task id>.mp4 instead of ~/Movies/better-tasks. Keep them out of git (add a gitignore entry) unless there's a reason not to, and say which way you chose. Watch the link length: the project path makes it longer (about 80 characters for this repo). Make sure it still shows on one row and is fully clickable in the approval question, and say what you measured. If it can't fit, tell me rather than shortening it some other way. Move the current sample there and give the new link.
- 2026-10-04: User (request changes): "and also in the task link to the video too". So: the task file itself gets the video link too, for example a "Video: <link>" line written when the video is made, where it's easy to find. If the /better-tasks board shows tasks, show the link there as well and make it clickable. Use a relative link inside the task file if that renders better (e.g. ../tasks_videos/T-011.mp4 from .claude/tasks/).
- 2026-10-04: demo-videos: videos are now saved in the project and linked from the task. Commit 22cd6e2.
- Where: <project>/.claude/tasks_videos/<task id>.mp4. The script finds the main checkout through git, so a teammate working in a worktree still saves into the real project. Kept out of git: the folder gets its own `.gitignore` holding `*`, written by the script. That works in every project without editing its own .gitignore, and videos are big binaries that would bloat git history.
- Task link: the teammate rule now puts `Video: [T-004.mp4](../tasks_videos/T-004.mp4)` as the first line under "## Notes" (a relative link, clickable in IDE previews). T-011's own task file has it now.
- Board: a task with a video shows a "Video" action (hotkey v) in its box on /better-tasks; it opens the video.
- Approval question: the lead writes file://<project root>/.claude/tasks_videos/<id>.mp4 on its own line.
- Sample moved (~/Movies/better-tasks removed). New link: file:///Users/iosif/Documents/Projects/better-tasks/.claude/tasks_videos/T-011.mp4
- Measured: the link is 82 characters. It fits on one row only if the question area is wider than about 85 columns. With the board docked on the right (the README picture: 149 columns total, the pane takes 62), the question area is about 85 columns, so it will likely wrap. It fits with the board closed or on a wider terminal. I didn't shorten it another way, as asked. Options if it wraps: close the board while answering, or the user picks a shorter place.
- Tests: 187 pass, 0 fail (new: the board's Video action); tsc clean.
- 2026-10-04: User review (request changes): "make sure that if a pr was created, then don't display the video path but the pr link only, also if possible, make sure that the video will start with the audio turned on". So: 1) Approval question: when the task has a PR (T-012 "PR per task" on), show only the PR link, with no file:// video line. The video is in the PR. The video line shows only when there's no PR. 2) Sound on at start: wherever the video opens (the local player from the file:// link or the board's v, and the GitHub PR player), it should play with the sound on, not muted. Find out what decides this (the mp4's audio track and codec, GitHub's player defaults, whether a muted start is forced) and do what's possible; say plainly what can't be controlled.
- 2026-10-04: demo-videos: PR link only, and sound on. Commit f3c16f6.
1) Approval question: when the task has a PR (PR per task on), it shows only the PR link; the video plays in the PR. The file:// video line shows only when there's no PR. Both lead rules say so.
2) Sound on, per place:
- Board "Video" (v): now opens the video in QuickTime Player and plays it at once, unmuted, volume full. Checked on this Mac: QuickTime reports muted false, volume 1.0. If QuickTime isn't there, it falls back to the default player.
- The file:// link in the approval question: the terminal hands it to the Mac's default video app. It opens with sound on (nothing mutes it), but QuickTime opens paused: press space. A clicked link can't make it autoplay.
- GitHub PR player: GitHub writes its own player with `muted` set (seen in the PR's rendered HTML). Nobody can change that from outside: the viewer clicks the speaker icon once. Can't be controlled.
- The video file: the audio track is AAC stereo 48 kHz, marked as the default track. I also made the narration louder: the voice is now normalised to a -1 dB peak (it was a soft -8 dB), about 5 dB louder.
- Sample rebuilt (same link): file:///Users/iosif/Documents/Projects/better-tasks/.claude/tasks_videos/T-011.mp4
- To test: on /better-tasks, select T-011 and press v; it should play right away with sound. Tests: 190 pass, 0 fail; tsc clean. Not verified: hearing it myself; I didn't start playback, to avoid sound on the user's Mac without warning.
- 2026-10-04: Resolved by the user. "Before/after videos" setting, asked at startup: Kokoro voice installed once per machine; teammates make a before/after mp4 with a BEFORE/AFTER label, red boxes and arrows, and narrated subtitles; saved in .claude/tasks_videos/ (git-ignored), linked from the task file and the board (v plays it with sound); the approval question shows the PR link when there's a PR, otherwise a one-line file:// video link.
