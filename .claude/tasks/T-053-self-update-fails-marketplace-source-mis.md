---
id: T-053
title: "Self-update fails: marketplace source mismatch with extraKnownMarketplaces"
sprint: 2026-10-05
urgent: false
status: done
owner: self-update
rolled: 0
order: -2
created: 2026-10-06
---
## Goal
The user saw this at session start (better-tasks self-update):

"better-tasks: could not fetch v0.11.3: ✘ Failed to add marketplace: Cannot add marketplace "better-tasks": its source doesn't match its extraKnownMarketplaces entry in user or managed settings; add it from the source that entry lists, or change the entry."

The message comes from hooks/register.tsx:454. The user's ~/.claude/settings.json has extraKnownMarketplaces.better-tasks = { source: { source: "github", repo: "iosifnicolae2/better-tasks" }, autoUpdate: true }, and ~/.claude/plugins/known_marketplaces.json lists the same source. The updater apparently re-adds the marketplace from a different source (e.g. pinned to the tag), which Claude Code now refuses.

Done: the self-update reaches v0.11.3 (and later tags) for a user whose settings carry an extraKnownMarketplaces entry, without the error, and without needing the user to edit their settings. Also check users without that entry still update.

## Notes
- 2026-10-06: 2026-10-06 (self-update teammate). Cause: when a project pins better-tasks, the updater re-adds the marketplace pinned to the new tag (`claude plugin marketplace add --scope project -- iosifnicolae2/better-tasks#v0.11.3`). Claude Code 2.1.290 refuses an add whose source doesn't deep-equal an extraKnownMarketplaces entry in user or managed settings (the ref counts), so it failed. Reproduced in an isolated CLAUDE_CONFIG_DIR (scratchpad before.txt).
Fix (commit ad2e2cf, branch of worktree agent-aaec0c147315c6c95): updateTo checks the user's settings.json (CLAUDE_CONFIG_DIR or ~/.claude) and the managed-settings.json paths for a better-tasks declaration. Declared: refresh the marketplace from the declared source (`marketplace update better-tasks`), then write the project's pin to the tag itself, then `plugin update`. Not declared: unchanged (re-add pinned to the tag). Projects with no pin: unchanged (refresh).
Verified with the CLI in isolated configs: user-declared + project pinned v0.10.8, installed 0.11.2 -> refresh + update gives 0.11.3 (after.txt). Without the declaration, only the existing re-add path moves a pin (a refresh does not follow an edited project file), so that path stays. Tests: claude plugin test . (322 pass), new test for declaresMarketplace.
Not verified: the whole Yes-to-update dialog in a live session (needs a cache install of this build); a managed declaration from an MDM plist rather than a file; a user declaration pinned to its own ref still stays on that ref (the "could not update" message shows then). No video: nothing on screen beyond one log line.
### For the user
Question:
T-053 Self-update failed with "source doesn't match its extraKnownMarketplaces entry"
What changed: when your own Claude Code settings list where better-tasks comes from, the update no longer re-adds it from another source; it refreshes from yours and moves the project's pin itself.
To try it: start a new session with this build (claude --plugin-dir /Users/iosif/Documents/Projects/better-tasks/.claude/worktrees/agent-aaec0c147315c6c95), or wait for the next release offer at startup and answer Yes.
Is everything OK?
- 2026-10-06: 2026-10-06 Finished: full tests pass (claude plugin test . 322 pass; yaml-check, open-pr-check, video-branch-check ok). No PR: the pull-request skill's settings say the git flow is straight to main (my prompt said PR per task; the saved setting wins). The fix is commit ad2e2cf on the worktree branch of agent-aaec0c147315c6c95, ready for the lead to land on main. No video: nothing on screen.
- 2026-10-06: 2026-10-06 Finished: full tests pass (322), yaml/open-pr/video-branch checks ok. No video (nothing on screen). PR: https://github.com/iosifnicolae2/better-tasks/pull/34
- 2026-10-06: Self-update refreshes from the marketplace source your user or managed settings declare, then moves the project's pin itself (PR #34)
