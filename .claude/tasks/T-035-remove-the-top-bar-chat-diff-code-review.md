---
id: T-035
title: Remove the top bar (Chat / Diff / Code Review) in iTerm
sprint: 2026-10-05
urgent: false
status: done
owner: iterm-top-bar
rolled: 0
order: -3
created: 2026-10-05
---
## Goal
User: "remove the top [bar] from iterm". Screenshot shows a bar at the top of the iTerm window with tabs "Chat ⌥⇧⌘1", "Diff ⌥⇧⌘2", "Code Review ⌥⇧⌘3", then a branch icon with "+17 files +5 lines", then a check-badge icon.

First find out where this bar comes from: an iTerm2 feature (e.g. its AI/Claude integration or a toolbelt/status bar setting), a Claude Code feature or setting, or something this project (better-tasks) draws. Then remove/hide it in the right place. If it is an iTerm or Claude Code setting the user must change themselves, write the exact steps in the notes. If it comes from better-tasks code, remove it there (or make it a setting, off by default) and commit.

Done: the bar no longer shows at the top of iTerm.

## Notes
No video: no code change; the fix is an iTerm setting the user changes by hand.
No commit, no PR: nothing in this repo draws the bar (grep of hooks/bin/skills/scripts: no hits).

2026-10-05 Source found: iTerm2 3.7.3 "Claude Code workgroup" (built into iTerm, not better-tasks, not Claude Code).
- Workgroup = iTerm groups the claude session with 2 peer sessions (Diff, Code Review); the bar is its peer switcher toolbar.
- Auto-entered by a trigger in the iTerm profile "Default": Job Started `claude` -> Enter Workgroup "builtin.claudeCode"; a 2nd trigger exits it when claude ends.
- Docs: https://iterm2.com/documentation-workgroups.html

Steps for the user (pick A, or B for a full removal):
- Right now, per window: Shell > Workgroups > Exit Workgroup. Closes the Diff/Code Review sessions, the bar goes; claude keeps running. Comes back next time claude starts unless A or B is done.
- A (keep the rest of the integration): iTerm2 > Settings (Cmd-,) > Profiles > "Default" > Advanced > Triggers > Edit. Select the row "Enter Workgroup" (Job Started, claude) and click "-" to remove it (or untick its Enabled box). Optionally remove the "Exit Workgroup" row too. Close. Then Exit Workgroup in open windows (step above).
- B (remove everything): iTerm2 menu > Uninstall Claude Code Integration. Removes the triggers and the iTerm hook it added to Claude Code settings.
Test: start `claude` in a new iTerm tab; no Chat / Diff / Code Review bar at the top.
Not verified by me: the exact click path in Settings (read from iTerm docs + prefs, not clicked); I changed no iTerm settings.
- 2026-10-05: The bar is iTerm2 3.7's built-in Claude Code workgroup, which a trigger in the Default profile starts. The user turned it off in iTerm by hand. No code change.
