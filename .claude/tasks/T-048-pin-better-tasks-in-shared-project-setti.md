---
id: T-048
title: Pin better-tasks in shared project settings (no unpinned auto-update); update check on startup
sprint: 2026-10-05
urgent: false
status: done
owner: plugin-pinning
rolled: 0
order: -4
created: 2026-10-06
---
## Goal
In another project, a background security review flagged: "Supply Chain - Unpinned Third-Party Plugin with Auto-Update in .claude/settings.json. It turns on the better-tasks plugin from the GitHub repo iosifnicolae2/better-tasks with automatic updates, without fixing it to a specific version."

User's words: "make sure to fix it and use the right things.. make sure to migrate it.. and also on startup, check for updates and ask the user to pin to the new one and restart claude to update.. or do the update and then you tell him to restart claude on startup.."

Done looks like:
1. Team setup (hooks/teaminstall.ts, hooks/projectsetup.ts, T-036's autoUpdate code) writes a pinned entry to the project's .claude/settings.json: the marketplace source fixed to a release tag (ref vX.Y.Z or the commit sha), and no "autoUpdate": true. Check Claude Code's docs for the right fields (extraKnownMarketplaces source ref/sha, enabledPlugins), and use what the security review would accept.
2. Migration: at startup, projects that already have the unpinned or auto-update entry get it rewritten to the pinned form (the current release), once, with one short line to the user. Commit the change in that project only if the git flow says so; otherwise leave it for the user.
3. Update check at startup: if a newer better-tasks release exists than the pinned one, ask the user once, short and plain: "better-tasks vX is out. Update?" Yes → move the pin to the new tag, update the installed plugin, then tell the user to restart Claude Code. No → don't ask again for that version.
4. README / settings doc updated; T-036's "projects get updates automatically" wording replaced. Tests pass; skills-check and settings-doc pass.
- Flow: quick checks and a local build first, then report done.

This repo is better-tasks upstream itself, so no fork is needed.

## Notes
- 2026-10-06: Video: [T-048.mp4](../tasks_videos/T-048.mp4)
PR: https://github.com/iosifnicolae2/better-tasks/pull/30
- Docs (code.claude.com plugins marketplace-reference, loading): a marketplace source takes `ref` (a branch or tag) only; `sha` is for plugin sources. `autoUpdate` is off by default for non-Anthropic marketplaces. `enabledPlugins` is true/false only. Pinned form: `source.ref: "vX.Y.Z"` and no autoUpdate. This is what `claude plugin marketplace add repo#vX --scope project` writes.
- Sandbox (own CLAUDE_CONFIG_DIR): editing `ref` in settings.json is NOT picked up by `marketplace update`. `claude plugin marketplace add repo#vNEW --scope project` moves both the settings and Claude Code's copy. Then `claude plugin update better-tasks@better-tasks --scope X` installed 0.10.7 from 0.10.6 ("Restart to apply"). The Yes path uses these commands.
- Changed: new hooks/updatecheck.ts. teaminstall.ts writes the pinned entry and has needsPin and maySelfCommit. register.tsx has pinShared (migration), checkForUpdate and updateTo, and shareWithTeam now pins. Commits better-tasks makes itself (pin, update): yes on direct; on dev-prs only on the dev branch; never on worktree-prs; never when settings.json had other edits. README, settings doc, and this repo's .claude/settings.json pinned to v0.10.8.
- Checks: claude plugin test . 318 pass; tsc clean; settings-doc --check and skills-check OK.
- Live test (detached tmux, claude --plugin-dir, scratch project with an unpinned entry and autoUpdate:true): BEFORE (main) changed nothing. AFTER printed "pinned to v0.10.8 ... Committed" and settings.json got ref v0.10.8 and no autoUpdate, in its own commit. A second start did nothing.
- Not verified live: the update question and its Yes path inside a real session. That needs a marketplace install of this code, which only exists after a release. Covered by the engine tests (Yes, No, linked install) and by the sandbox CLI run above.
- Known: teammates on older better-tasks re-add autoUpdate:true (T-036 code) until they update; the ref pin stays. Follow-up idea: release.sh could also write the commit sha in the plugin entry (sha is allowed there).
- Commits: d8bdd88, ba28b58

### For the user
Links:
[PR #30](https://github.com/iosifnicolae2/better-tasks/pull/30)
Question:
T-048 Pin better-tasks in shared project settings; update check on startup
What changed: projects now name a fixed better-tasks release in .claude/settings.json, with auto-update off. Projects set up the old way get pinned once, at their next start, with one line saying so. At startup, if a newer release is out, you're asked "better-tasks vX is out. Update?" Yes updates it and tells you to restart Claude Code. No means you're not asked again for that release.
To test: open the project that was flagged by the security review and start Claude Code with this build. You should see the "pinned to ..." line, and its .claude/settings.json should show "ref" with no "autoUpdate". The update question shows up once a release newer than yours is out.
https://github.com/iosifnicolae2/better-tasks/pull/30
Is everything OK?
- 2026-10-06: Shared project settings pin better-tasks to a release tag (no autoUpdate); old projects migrated once at startup; startup update check asks to update and restart. 318 tests pass.
