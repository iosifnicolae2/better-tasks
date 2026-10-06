---
id: T-071
title: Pass the plugin directory validation (12 blocking issues + icon)
sprint: 2026-10-05
urgent: true
status: doing
owner: validation
rolled: 0
order: -3
created: 2026-10-06
---
## Goal
The user asked to submit better-tasks to the Anthropic plugin directory ("open chrome and submit the plugin"). The portal's validation of v0.11.11 blocks submission. Full findings: /Users/iosif/Documents/Projects/better-tasks/.claude/tasks/T-070/validation.md (screenshot T-070/validation-blocked.jpg).

Fix the 12 blocking issues without losing behavior:
1. .claude-plugin/plugin.json userConfig: 10 options refused (easyEffort, easyModel, editor, hardEffort, hardModel, normalEffort, normalModel, sprintStart, sprintWeeks, videoQuality). Each option may only have type (string, number, boolean, directory, file), title, description, default (string, number, boolean or list of strings). The extra `options` key is the likely cause. Keep the choices working some other way (e.g. listed in the description, validated in code).
2. hooks/pane.tsx:147: write the default permission mode as `config.set({ key: '<fixed text>', value: ... })` on the hook's first parameter.
3. hooks/register.tsx:260: the permission hook must visibly leave the decision with the user: hooks written as on(event, hook) in the registering file, returning next(e) or a fixed 'deny'/'ask' object; agents described as an object with permissionMode as fixed text and no hooks.

Also, cheaply:
- Warnings: remove the unknown `types` field from plugin.json if nothing needs it; mention the root CLAUDE.md warning but don't move it unless trivial.
- Add .claude-plugin/icon.png: square PNG, 512–2048 px, under 2 MB, simple and generic. The portal sets the listing icon only on the first save or submit and it can't be changed later, so the user sees it in the PR before it ships.
- README: add the disclosures the policy holds ask for (what config/env it sets, which slash commands it runs and when, what goes in the prompts it submits, what data goes where, which programs it starts, which files it writes). These go to a human reviewer; disclosure is enough.

The repo goes straight to main (a review-only draft PR with a video). No release yet: the release comes after the user approves. Then directory-2 (T-070) re-validates from the saved portal draft.

## Notes
- 2026-10-06: Video: [T-071.mp4](../tasks_videos/T-071.mp4)
2026-10-06 validation: done, commits ca0f027 (fixes), 3a82263 (icon), 5c8d16c (README). (1) plugin.json: no `options` in userConfig; choices listed as "One of: ..." in each description; settingsOf now also checks editor, sprintWeeks and sprintStart, so any other value counts as unset (as the engine did with options). Loss: /config shows a text field instead of a picker for those 10 rows; our own settings page still cycles the choices. (2) pane.tsx: writeOption() spells out each `better-tasks.<field>` key as fixed text in `$.config.set`. (3) register.tsx: teammate types registered as an explicit object with permissionMode 'default' (docs: a lead in bypass/acceptEdits/auto gives its own mode anyway; only a lead in plan or dontAsk mode now gets manual-mode teammates). `types` kept: removing it makes `claude plugin validate` fail with 20 errors (the $.state contract), so the warning stays. Root CLAUDE.md warning: not moved (it is this repo's own project rules). Icon: .claude-plugin/icon.png 1024 px, 19 KB. README: disclosures section extended. Checks: claude plugin test . 322 pass; bunx tsc clean; validate passes (1 warning, CLAUDE.md); settings-doc current. Live (tmux, --plugin-dir, scratch project): /config Editor before = picker, after = text field with choices (scratchpad t071/shots). Not verified: the portal's own checks; only the portal can say whether the 12 pass.
- 2026-10-06: PR: https://github.com/iosifnicolae2/better-tasks/pull/39 (draft, review only; commits are on local main, not pushed). Next: the portal can check branch task/T-071 before the release, but careful: the icon is set on the first save or submit and can't change, so validating a branch that has icon.png may fix it before the user approves it. Safer: user approves the icon in the PR first, then directory-2 validates.

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/39
T-071 Pass the plugin directory validation
Fixed the 12 issues that blocked the directory submission, added a listing icon (please check it: it can't be changed later) and wrote in the README what better-tasks sets, runs and sends. In /config, 10 settings are now typed in instead of picked from a list; the board's settings page still lets you cycle through the choices.
- 2026-10-06: User accepted PR #39, icon included, with one condition: "you close the task when the submission is finished". Keep T-071 open, and keep its teammate, until the directory submission (T-070) is done.
- 2026-10-06: 2026-10-06 accepted. Full tests: claude plugin test . 322 pass; tsc clean; validate passes (1 warning, root CLAUDE.md); yaml-check 40/40; video-branch, task-pr and open-pr checks ok; settings-doc, skills-check, templates and instructions-doc current. Not run: record-display-check (the screen recorder; this task didn't touch it). Review PR #39 closed. Not pushed, no release (the lead arranges both). Task stays open until the submission is done; portal blockers come back here.
- 2026-10-06: Portal re-check of task/T-071 @ f8af5ba (by directory-2): 1 blocking issue left, down from 12. It's hooks/pane.tsx:152, "Mod may write the default permission mode in a way the directory couldn't read". The config.set calls sit in the helper writeOption($, field, value). The portal wants config.set written on the hook's own first parameter, inside the hook itself, not in a helper that gets $ passed in. It also says "a mod that keeps a copy of its engine ... cannot also make a settings call: remove the call, or change that hook". The 10 userConfig blockers, the register.tsx:260 blocker and the icon all pass now. Full details: T-070 task notes. Once this is fixed, directory-2 re-validates the task/T-071 branch.
- 2026-10-06: 2026-10-06 pane.tsx:152 fix: commit ac35f28 on local main (not pushed), pushed as task/T-071 @ 53d804a (f8af5ba + this commit). The /config writes are now in a `ui.press` hook on the settings page's rows (registerPane): `$.config.set({ key: 'better-tasks.<field>', value })` with each key as fixed text, on that hook's own `$`, and the hook takes the press. The render closure (setConfig) now only saves project-only settings to config.json. Tried first: a state.set hook fed by the closure. It doesn't work because the plugin's own state writes don't reach its own state.set hooks (checked in the test kit), so I dropped it. Checks: claude plugin test . 322 pass (the settings page press test still records every better-tasks.* write); tsc clean; validate passes. Not checked live: pressing a settings row in a real terminal (I couldn't give the pane the keys in tmux). The user sees no change, so no new video.
- 2026-10-06: Portal re-check of task/T-071 @ 53d804a (by directory-2): still 1 blocking issue, and it moved to hooks/pane.tsx:421, the first config.set in the new ui.press hook (case 'editor'). The portal's code is MOD_CONFIG_SET_UNREAD: "the argument is not one object written in the call with plain key and value members, or the key is not fixed text". The keys are already fixed text, so the shorthand `{ key: '...', value }` is the likely cause. Suggestion: write `value: value` (a plain member) in all 14 calls. If the value is computed, check it's a plain expression. The portal names only the first call, so make all 14 match. Other counts are unchanged.
- 2026-10-06: 2026-10-06 pane.tsx:421 fix: commit b409494 on local main (not pushed), pushed as task/T-071 @ c1cd830. All 16 config.set calls in the ui.press hook (14 in the portal's count, plus openPrInBrowser and demoVideos) now read `$.config.set({ key: 'better-tasks.<field>', value: value })`, with no shorthand. `value` is a plain local, computed before the switch. I also reworded a comment that named $.config.set. Checks: 322 pass, tsc clean, validate passes. The user sees no change.
