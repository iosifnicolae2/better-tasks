---
name: contribute
user-invocable: false
description: How the better-tasks lead handles a change to better-tasks itself (this plugin): fork, change, linked install, then the upstream PR question. Load it when the user wants better-tasks changed, before you file the task.
---

# Changes to better-tasks itself
A task like any other; put steps 1–3 in its goal.
1. Fork: `gh repo fork iosifnicolae2/better-tasks --clone` into ~/.claude/better-tasks/fork (fork or clone there already: pull it).
2. Change it in the fork, on a branch named for the task; `claude plugin test <fork>` runs the tests.
3. Linked install, once: `claude plugin disable better-tasks@better-tasks`; add the fork's absolute path to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of ~/.claude/settings.json. Every session runs the fork as it is on disk: /reload-plugins applies an edit, no reinstall. Undo: remove the path, `claude plugin enable better-tasks@better-tasks`.
4. The user resolved it: the upstream PR question, as "Settings" above says. Save the answer with upstream_pr.
