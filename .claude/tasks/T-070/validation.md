# T-070: portal validation of v0.11.11
What the directory portal's Source check said about iosifnicolae2/better-tasks@v0.11.11 (3112857) on 2026-10-06. Open it to plan the fixes before re-submitting; screenshot: validation-blocked.jpg.

Result: 12 blocking, 9 warnings, 15 policy holds; 4 of 7 checks passed. Next is disabled until the blocking ones are fixed. Draft saved in the portal tab, nothing submitted.

## Blocking (12)
- Invalid userConfig option, 10 findings, .claude-plugin/plugin.json: easyEffort, easyModel, editor, hardEffort, hardModel, normalEffort, normalModel, sprintStart, sprintWeeks, videoQuality. Portal: "Each option needs type (string, number, boolean, directory, file), title and description; default is a string, number, boolean or list of strings; keys this check does not know are refused." Likely cause: the `options` key (e.g. easyEffort has type/title/description/options/default).
- hooks/pane.tsx:147: mod may write the default permission mode in a way the directory couldn't read. Wants `config.set({ key: 'name', value: ... })` on the hook's first parameter, key as fixed text.
- hooks/register.tsx:260: the directory couldn't confirm the mod leaves a permission decision with the user. Wants hooks written as on(event, hook) in the registering file, return next(e) or a fixed 'deny'/'ask' object; agents described as an object with permissionMode fixed text and no hooks.

## Policy holds (15: held for a reviewer, not refused)
- pane.tsx:147 sets configuration/env vars (say in README what it sets)
- pane.tsx:584 runs slash commands (say which and when)
- register.tsx:136 can take a permission decision out of the user's hands
- register.tsx:344 reads conversation and submits prompts (say what goes in them)
- register.tsx:376 reads local data / conversation and sends data out; starts other programs (say what, where, which programs)
- register.tsx:399 writes a file other tools run or obey (say so; path as fixed text)
- register.tsx:438 starts a program with a command not readable in full
- 2 image/font files the code could run
- bin/away.sh: couldn't confirm the mod stays the same after it's checked (no wildcard/variable paths)
- uses a credential from the user's machine, 2 findings (wants user_config sensitive: true)
- docs/videos/sample-before-after.mp4 not inspectable

## Warnings (9)
- plugin.json unknown field `types`
- register.tsx:189 may change a tool's input
- may answer a tool call in place of the tool, 2 findings
- no icon: .claude-plugin/icon.png, square PNG 512-2048 px, under 2 MB; set only on the FIRST save or submit in the portal, never changeable after. (The draft is saved already; unclear whether a draft save counts.)
- CLAUDE.md at the plugin root isn't loaded
- download-and-run command, 3 findings

## Notes (no change needed, or README mention)
- register.tsx:120 and :136 hook events that settings/calls pass through (say in README what they change)
- register.tsx:399 writes files (say what)
