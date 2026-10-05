---
id: T-036
title: Projects set up with better-tasks get updates automatically
sprint: 2026-10-05
urgent: false
status: done
owner: project-setup-2
rolled: 0
order: -3
created: 2026-10-05
---
## Goal
User's words: "when setting up better-tasks in projects make sure that it's auto updating".
So: when better-tasks is set up for a project (the per-project / whole-team setup from T-029: project_init, the project's .claude/settings.json marketplace + plugin entry), the install must pick up new releases by itself, with no manual `claude plugin update`. Check how Claude Code handles auto-update for marketplace plugins (marketplace autoUpdate setting or similar) and turn it on in what the setup writes. Also check existing installs (this repo's own setup) get it.
Done: a project set up with better-tasks receives the next release automatically; tested (e.g. with a test release or by checking the setting Claude Code reads); the docs/settings mention it in one line.

## Notes
- 2026-10-05: project-setup done. No video (settings change). PR: https://github.com/iosifnicolae2/better-tasks/pull/18. Why: Claude Code auto-updates a marketplace's plugins only when the marketplace has autoUpdate on, and that is off by default outside Anthropic (code.claude.com/docs/en/plugins/install.md; key shape: plugins/org.md). It runs after startup, and the new version loads at the next startup. Changed: hooks/teaminstall.ts writes extraKnownMarketplaces.better-tasks.autoUpdate:true into the project's .claude/settings.json. Older shared setups (lacksAutoUpdate) get the key at startup in a commit of only that file, not asked again, not pushed (register.tsx askTeamInstall/shareWithTeam). Docs: README install section and the shareWithTeam setting text. Test: claude plugin test . (290 pass, new unit and integration tests). Commits f39f623, 7d935b5 on task/T-036. Not verified: a real release reaching a teammate (needs a tag and an interactive restart). The CLI marketplace list shows only registered marketplaces. The docs don't say whether the project autoUpdate wins over a user entry without it. This repo has no shared settings; the user's install (user scope) has autoUpdate off, so turn it on once: /plugin, Marketplaces, better-tasks, Enable auto-update. User config not touched.
- 2026-10-05: project-setup-2 took over; PR #18 already had the work. Added c9448b3 (pushed to task/T-036): turning on auto-update keeps a marketplace source already in the project's settings (a fork from the contribute flow) instead of overwriting it with iosifnicolae2/better-tasks; new unit test. Test: claude plugin test . (291 pass). Correction to the note above: the user's own install already has auto-update on (~/.claude/settings.json extraKnownMarketplaces.better-tasks.autoUpdate: true; it moved to 0.9.0 by itself at 17:19), so nothing to do there. Precedence, per code.claude.com/docs/en/plugins/loading.md "Which marketplaces and plugins auto-update": autoUpdate on an extraKnownMarketplaces entry in a settings file wins over the /plugin toggle; DISABLE_AUTOUPDATER / DISABLE_UPDATES / CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC turn it off unless FORCE_AUTOUPDATE_PLUGINS=1. Still not verified: a real release reaching a teammate's project install.
- 2026-10-05: Team setup writes "autoUpdate": true on the better-tasks marketplace in the project's .claude/settings.json; older shared projects get it added at startup; README says how to enable it for your own install (user enabled theirs).
