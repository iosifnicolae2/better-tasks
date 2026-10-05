---
id: T-046
title: Settings page in groups (terminal)
sprint: 2026-10-05
urgent: false
status: done
owner: settings-groups
rolled: 0
order: -2
created: 2026-10-06
---
## Goal
User asked during T-045: "make sure to also reorganize by groups the settings". T-045 (Claude Desktop support) was dropped, but this part is wanted in the terminal.
- Show the settings page in groups, each with a heading: General, Git & PRs, Testing & videos, Teammate models, Sprint, This project (as built in T-045).
- Take the grouping from branch worktree-agent-a4fd357a8255c38b4 (commits 952ab58 and 4a6f7f6 touch the settings page and skills/settings/SKILL.md), terminal part only, without the Desktop code.
- Regenerate skills/settings/SKILL.md and the README settings picture. Tests, skills-check and settings-doc --check pass.
- Flow: quick checks and a local build first (claude --plugin-dir on the worktree), then report done.

## Notes
- 2026-10-06: Video: [T-046.mp4](../tasks_videos/T-046.mp4)
PR: https://github.com/iosifnicolae2/better-tasks/pull/27

(settings-groups) Done.
- hooks/configpage.tsx: a `GROUPS` list (General, Git & PRs, Testing & videos, Teammate models, Sprint) drives the headings; fields regrouped as in T-045's 952ab58, terminal only (no look.tsx / Desktop code). "This project" stays last.
- scripts/settingsdocs.ts: T-045's 4a6f7f6 grouping, minus its two Claude Desktop phrases; skills/settings/SKILL.md regenerated. README picture docs/screenshots/settings.svg regenerated (node scripts/screenshots.mjs); the other three pictures came out unchanged.
- New test in tests/pane.test.ts: the six headings in order.
- Checks: `claude plugin test .` 300 pass; settings-doc --check current; skills-check OK.
- Seen: the picture is drawn from the real pane tree in the test run (before/after in the video). Not done by me: an interactive `claude --plugin-dir <worktree>` session (the user's local build step).
- Commits: b2a3d89, 1d60b7e (branch task/T-046). Worktree: /Users/iosif/Documents/Projects/better-tasks/.claude/worktrees/agent-a0ac0953b743208a0

### For the user
Links:
[PR #27](https://github.com/iosifnicolae2/better-tasks/pull/27)
Question:
T-046 Settings page in groups
What changed: the settings page now shows its settings in groups, each under its own heading: General, Git & PRs, Testing & videos, Teammate models, Sprint, This project.
To test: start Claude with this build, run /better-tasks config, and look at the headings. Enter still changes a setting.
https://github.com/iosifnicolae2/better-tasks/pull/27
Is everything OK?
- 2026-10-06: Settings page in six headed groups (General, Git & PRs, Testing & videos, Teammate models, Sprint, This project); docs and README picture regenerated. 300 tests pass.
