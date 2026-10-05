---
id: T-024
title: "Notice: changes to better-tasks go to a fork with a live-linked install, then ask about a PR upstream"
sprint: 2026-10-05
urgent: false
status: done
owner: contribute
rolled: 0
order: -6
created: 2026-10-05
---
## Goal
User's words: "in the better-tasks claude.md add a short notice that if the user want any change, you will fork the repo, do the changes, install a locally linked version which udpates in real-time.. and also at the end ask the user if he wants to open a PR to the main repo (he should have a choice to not do it at all, or no for now.. and keep this in the config..)"

Goal: a short notice in better-tasks' own instructions (the "claude.md" the plugin gives Claude; decide whether that's the repo CLAUDE.md, the rules the plugin injects into users' sessions, or both, and say why). It says: when a user wants a change to better-tasks itself, Claude
1. forks the repo (gh repo fork) into the user's account,
2. makes the change in the fork,
3. installs the fork as a locally linked plugin that updates in real time (no reinstall per edit),
4. when the change is done, asks the user whether to open a PR to the main repo, with three choices: "Yes, open a PR", "Not now" (ask again next time), "Never" (don't ask again).
The answer is saved in config (per user is fine here, since it's about the plugin, not a project; say where).

Keep the notice short (keywords over paragraphs). Done: the notice exists, the question and saved choice work; explain how to check.

## Notes
- 2026-10-05: (contribute) Done. PR: https://github.com/iosifnicolae2/better-tasks/pull/5 (branch task/T-024, based on main a51da80). Commits 31172e2, 8d2a3b9. No video: the change is rules text plus a tool, and the question is the lead's usual AskUserQuestion, so there is nothing new on screen.
- Where the notice lives: in the lead's injected rules (hooks/contribute.ts, added in register.tsx prompt.compose). Users ask for changes from inside their own projects, where the repo CLAUDE.md never loads. The repo CLAUDE.md and README each get one line pointing at it.
- Steps: 1. fork (gh repo fork iosifnicolae2/better-tasks --clone into ~/.claude/better-tasks/fork); 2. change it on a branch; 3. linked install: disable better-tasks@better-tasks and put the fork path in CLAUDE_CODE_PLUGIN_DIRS in the env block of ~/.claude/settings.json, so an edit applies on /reload-plugins; 4. the PR question: "Yes, open a PR" / "Not now" / "Never". The lead puts steps 1-3 in the task goal for the teammate.
- Saved answer: the new tool upstream_pr writes ~/.claude/better-tasks/user.json (per user, all projects). Only "never" sticks; after it, step 4 says not to ask. It is not a plugin option on purpose: the linked fork runs under another plugin id, so an option set there would not reach the marketplace install.
- How to check: claude plugin test . (250 pass, 6 new in tests/contribute.test.ts). Checked live with claude -p --plugin-dir <worktree>: step 4 showed the question; upstream_pr with never wrote the file; the next session's step 4 said "No PR question". I removed the test file afterwards.
- Not verified: the full linked install. The CLI does support CLAUDE_CODE_PLUGIN_DIRS, but I did not try it end to end, to leave the user's settings untouched. The answer does not show on the settings page (it is a user file, not a /config option).
- 2026-10-05: Lead rules: changes to better-tasks go to a fork with a linked install; at the end ask about a PR upstream (Yes / Not now / Never; Never saved in ~/.claude/better-tasks/user.json).
