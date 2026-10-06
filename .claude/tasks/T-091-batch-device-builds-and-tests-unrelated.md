---
id: T-091
title: "Batch device builds and tests: unrelated tasks share a branch behind feature flags (setting, on by default)"
sprint: 2026-10-05
urgent: true
status: doing
owner: batch-testing
rolled: 0
order: -2
created: 2026-10-07
---
## Goal
User's words: "add a short rule to coordinate builds and tests on devices by combining tasks from different parts which don't interact with each other in a common branch kind of and test multiple things at once using feature flags, at the end make sure to remove the feature flags after you decided that everything is working correctly, make this behaviour configurable in config, by default set it to true.."

1. A new setting (e.g. `batchDeviceTests`, boolean, default true) in the usual settings places: plugin.json userConfig or project config, the settings skill and settings page, and the docs generated from them. Follow how existing boolean settings like demoVideos are defined.
2. A short lead rule, shown only when the setting is on, stating principles only per CLAUDE.md: when builds or device tests are slow, combine tasks from different areas that don't interact into one shared build branch, each behind its own feature flag, so one build and one device run tests several at once. Once a task is confirmed working, remove its flag and the dead path before its task closes. Add a matching short teammate line if teammates need one (put your change behind a flag when the lead says it's batched; remove the flag at the finish).
3. Tests: the rule appears with the setting on and is gone with it off; the setting's default is true.

This is the user's own repo: commit to main, with a review-only draft PR and a video of the setting (e.g. on the settings page). No release until the user approves. Small bugs in your area: fix them here. Bigger or other-area ones: report them to the lead.

## Notes
Video: [T-091.mp4](../tasks_videos/T-091.mp4)
- 2026-10-07: User refines: "when it's possible to launch multiple instances do it.. use the flags only when you need to test different things or the risk of having a problem in two problems is pretty high and you want to test them individually.. use what it's industry standard and which works very well".
- First choice: when the app or devices allow several instances (simulators, emulators, app copies, test users), run each task's build on its own instance in parallel, with no shared branch or flags needed.
- Feature flags on a shared build only when instances aren't possible and the builds are slow. Flag a task when it needs to be tested separately (different things), or when two changes are likely to clash and each needs testing on its own. Changes with low risk that don't interact can share one build without flags.
- Use the industry-standard practice that works well: short-lived flags, default off, one per task, toggled at runtime or with an env var or launch argument, and removed together with the dead path once confirmed. No custom framework.
Keep the rule short and lean: principles only.
- 2026-10-07: BEFORE (live, tmux socket t091, Claude Code 2.1.292, `claude --plugin-dir` on a `git archive HEAD` copy, scratch project scratchpad/t091/shop): /better-tasks config has no batch row under Testing & videos; lead.md and teammate.md have no batching or feature-flag line. Capture: scratchpad/t091/cap/before-settings.ansi.
- 2026-10-07: Plan: setting `batchDeviceTests` (boolean, default true, /config row "Batch device tests", config.json too), a {% if %} line in lead.md Routing and teammate.md's top list, tests in rules.test.ts and demovideo-style settings test.
- 2026-10-07: Commit b73eac2. `sh scripts/test.sh` 348 pass; settings-doc --check current; instructions-doc renders both lines. AFTER (live, tmux, `claude --plugin-dir` on this checkout, same scratch project): settings page shows "Batch device tests  on" under Testing & videos; `"batchDeviceTests": false` in the project's config.json shows "◆ Batch device tests  off". Fresh lead asked to quote its feature-flag rules: on, it quotes the Routing line; off, "none of my better-tasks rules mention feature flags". Mid-session switch to off also drops it. Captures: scratchpad/t091/cap/after-*.
- 2026-10-07: Video made (41 s, spec scratchpad/t091/spec.json): settings row before/after, the lead quoting its rule on and off. The private path in the lead captures is covered.
