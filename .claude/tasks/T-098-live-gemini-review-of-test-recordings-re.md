---
id: T-098
title: "Live Gemini review of test recordings: real-time flags, timestamped annotated video"
sprint: 2026-10-05
urgent: false
status: doing
owner: live-review
rolled: 0
order: 3
created: 2026-10-07
labels: [live-review, video]
---
## Goal
User's words: "add a new task for this sprint to record everything and pass it to gemini in real-time to monitor and flag everything, then you will have a timestamped video with very good observations and annotations".

While a teammate (or the batch tester) tests, the screen recording is streamed to Gemini in real time (the Gemini Live API or video understanding; check the current Gemini docs and model ids, not memory). Gemini watches and flags anything off: errors, glitches, layout problems, slow steps, unexpected states. Each flag carries a timestamp. The result is the before/after video with those observations as timestamped annotations (captions or markers in the video, plus a list in the task file and the PR). The teammate reads the flags to find bugs it missed.

Constraints:
- An opt-in setting (e.g. `liveReview`), with the user's own Gemini API key from the environment; nothing is sent without it. Say plainly in the README and settings what is sent where.
- Privacy (T-084's rule): mask or blur secrets and personal data before anything leaves the machine; never send the user's real screens, only the test screen or virtual display.
- Fits the existing recorder (bin/record-display.sh, demo-video.sh, the video spec), and the batched tester flow (T-094 (#54)).
- Cost and latency: low frame rate or keyframes; say the cost per minute.
- Tests for the setting and the annotation format; a demo video with real Gemini annotations.

User's repo: commit to main, with a review-only draft PR and a video. No release until the user approves.

## Notes
Video: [T-098.mp4](../tasks_videos/T-098.mp4)
- 2026-10-07: User's words (2026-10-07): "start working on 098, make sure to use the gemini live js sdk, make it record and write the timestamps configured observations absed on the teammate instructions, also the agent should look and also flag things which are not ok.. then the teammate can take a look at the recorded video and analyse it carefully.. the token should be stored safely in keychain and configurable from config.. (do not store it in the json or in the project.. - and allow one token to be used globally or just in that project.. by default globally..), when you need i can create a token for you to test things". Then: "use ai studio".
What this means:
- Use the Gemini Live API through the official JS SDK (@google/genai, Live API), with an AI Studio (Gemini Developer API) key, not Vertex. Check current docs and model ids via Context7, not memory.
- While recording, Gemini writes timestamped observations of what the teammate told it to watch (the teammate's instructions for that test), and on its own also flags anything that's not OK.
- Afterwards the teammate reviews the recorded video with those flags and analyses it carefully.
- The API key: stored in the macOS Keychain, set from the better-tasks config (settings page / /better-tasks config). Never in config.json, settings JSON or the project. One key used globally by default; optionally a per-project key that overrides it.
- When a real key is needed for testing, ask the lead: the user will create one.
- 2026-10-07 (live-review): BEFORE: /private/tmp/claude-501/-Users-iosif-Documents-Projects-better-tasks/21a0db98-8933-4267-a30f-c0d793bfd28a/scratchpad/before/settings.png (settings page, no live review rows). Docs (Context7, ai.google.dev): Live models `gemini-3.8-live`, `gemini-3.1-flash-live-preview`; audio-out only, so observations come as function calls; frames ≤1 fps JPEG; audio+video sessions 2 min unless contextWindowCompression; price image/video in $0.002/min, audio out $0.018/min.
- Plan: bin/live-review.sh (key set/status/remove in the Keychain, service "better-tasks gemini", account global or the project root; start/stop around a recording on the test display) + bin/live_review.mjs (@google/genai installed once in ~/.cache/better-tasks/live-review); hooks/livereview.ts (pure: observation format, SRT, prompt); setting `liveReview` (off) + "Gemini API key" row on the settings page; demo_video.py draws a clip's "flags" (observations.json); testing.md/video.md lines; README privacy line.
- 2026-10-07: User's words (2026-10-07): "also in the timestamps display also what you see, what is happening like a human tester would do". So the timestamped log isn't only flags: it's also a running narration of what's on screen and what's happening at each moment, written like a human tester's notes (e.g. "00:12 settings page opens, Editor row shows 'code'; 00:15 pressed Enter, value cycles to 'cursor'"). Flags and the teammate's watch points sit alongside that narration.
- 2026-10-07: User (2026-10-07), on the warning that free-tier AI Studio keys let Google use and have people review what's sent: "request to be a billed key..". So the feature asks for a key from an AI Studio project with billing on (paid tier). Say so plainly wherever the key is set (settings page, README, setup text), with the reason: on the free tier Google may use the recordings to improve its products and humans may review them. Check the current Gemini API terms for the exact wording, not memory. If the API lets you tell a free-tier key from a paid one, warn or refuse on a free key; if not, state the requirement clearly. The user's own test key will be a billed one.
- 2026-10-07 (live-review): Works end to end on the virtual display (scratchpad/demo: a shop page with a wrong total, a stuck spinner, an error toast). Learned: realtime video frames of a UI are deduplicated by the Live API (one frame per turn kept), so the module sends the frames that changed as a client turn every 3 s, each after "t=<s>s"; observe is NON_BLOCKING, answered SILENT (no extra turn); repeats dropped. Result: all 3 bugs flagged at the right seconds, $0.018 for 47 s. screencapture can't write a dotfile and still exits 0.
- 2026-10-07: PR: https://github.com/iosifnicolae2/better-tasks/pull/60
- 2026-10-07 (live-review): Done, review PR #60. What changed: bin/live-review.sh (start/stop in a record-display turn; key set/remove/status in the Keychain, global or --project), bin/live_review.mjs (Gemini Live session, gemini-3.8-live via @google/genai 2.27.0, frames that changed sent as turns every 3 s, each "t=<s>s"; reports: step, watch, FLAG), hooks/livereview.ts (shared pure part), setting liveReview (off) + "Gemini API key" row, demo_video.py (a clip's "review" shown as cards; --annotate → annotated.mp4), testing.md/video.md lines, README (what is sent where, billed key), settings skill, tests (tests/livereview.test.ts, pane, rules). Billed key: stated in the key prompt, settings row, README, plugin.json, settings skill (the API can't tell a free key from a paid one). Measured: $0.018 for a 47 s test. Bugs fixed on the way (mine): screencapture can't write a dotfile and still exits 0; realtime UI frames get deduplicated by the Live API, hence frames as turns. Not checked: pressing the key row in a live Claude Code session (its macOS dialog would pop on the user's screen); the tty path, Keychain save/remove and the row's value were checked. Demo: scratchpad/demo (shop.html, test.sh, review/).

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/60
T-098 (#60) Live Gemini review of test recordings
While a teammate tests, Gemini watches the test screen live, notes each step like a human tester, and flags anything not OK at its second; the reports go on the video and in the task. Your billed Gemini key is set from the settings page and kept in the Keychain (every project, or one project).
