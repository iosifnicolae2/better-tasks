---
id: T-027
title: Docs of every better-tasks setting, as a skill the agent loads when needed
sprint: 2026-10-05
urgent: false
status: done
owner: config-docs
rolled: 0
order: -8
created: 2026-10-05
---
## Goal
User's words: "also make sure that the better-tasks has some docs about what can be configured and what means each thing.. this will be like a skill which can be loaded by the agent when needed"

Goal: a skill shipped with the plugin (skills/<name>/SKILL.md) that lists every better-tasks setting: its name, what it means in plain words, the choices and default, where it's saved (per user in /config or per project in .claude/tasks/config.json), and how to change it. Short, keywords over paragraphs, easy to grep. Its description should make the lead and teammates load it when a user asks about settings or wants to change one. Keep it from going stale: one source of truth (generate it from settings.ts / plugin.json, or a test that fails when a setting is missing from the doc). README links to it instead of repeating it.

Includes settings added today: git flow, project instructions, video quality, test off-screen, IntelliJ exclusion, upstream PR choice, and the PR template path (T-026, in progress).
Done: the skill loads in a session and answers "what can I configure?"; explain how to check.

## Notes
- 2026-10-05: No video: a docs skill, nothing on screen to show.
- 2026-10-05 What changed (commit 53a00db, branch task/T-027):
  - skills/settings/SKILL.md (better-tasks:settings): every setting, one table row each: key, meaning, choices, default, where (/config title or config.json); plus upstreamPr (user.json) and the .claude/tasks/ project files.
  - One source: scripts/settingsdocs.ts holds one plain line per key; choices and defaults come from hooks/settings.ts (FIELDS, DEFAULTS, PROJECT_KEYS), /config titles from plugin.json. `bun scripts/settings-doc.ts` writes the skill, `--check` says if it is stale.
  - Guards: tests/settingsdocs.test.ts fails when settings.ts gains a key with no doc line; release.sh refuses to release with a stale skill.
  - README "More" links to the skill instead of repeating it.
- How to check: `claude plugin test .` (settingsdocs tests pass); `bun scripts/settings-doc.ts --check`; `claude -p --plugin-dir . "What can I configure in better-tasks?"` loads better-tasks:settings and lists the groups (done: it called Skill better-tasks:settings and answered from it).
- Open: T-026's PR-template setting is not in yet; once it is in settings.ts, the test fails until a line is added to scripts/settingsdocs.ts and the skill is regenerated. Asked pr-template for the details.
- Not verified: tsc (the worktree has no .claude-plugin/types).
- PR: https://github.com/iosifnicolae2/better-tasks/pull/8
- 2026-10-05: pr-template's planned key: prTemplate (string, default "", config.json only). Line to add to SETTING_DOCS once it is in settings.ts FIELDS, then `bun scripts/settings-doc.ts`:
  `prTemplate: { group: 'Team', about: 'The project\'s PR description template, a path from the project root. Empty: the template where GitHub or GitLab look (.github/pull_request_template.md, …), else better-tasks\' own. The settings page row "PR template" opens it or adds the built-in one.' },`
- 2026-10-05: better-tasks:settings skill lists every setting (meaning, choices, default, where saved), generated from settings.ts/plugin.json; a test and release.sh guard keep it current.
- 2026-10-05: prTemplate's doc line and the regenerated skill are in T-026's PR #10 (rebased on #8), per pr-template. Nothing left open here.
