---
id: T-006
title: Merge into main; only iosifnicolae2/better-tasks, no supermanager
sprint: 2026-09-28
urgent: false
status: done
owner: repo
rolled: 0
order: 0
created: 2026-10-03
---
## Goal
Everything on `mod` is merged into `main` and pushed to iosifnicolae2/better-tasks (the marketplace source), so the installed copy can update. The repo uses only iosifnicolae2/better-tasks: the bringes/supermanager remote and leftovers (old .supermanager worktrees, sm/* branches, .gitignore entry) are gone.

## Notes
- 2026-10-03: User chose: delete the bringes/supermanager GitHub repo too; continue work on main (delete mod).
- 2026-10-03: main fast-forwarded 7cc11b0 → 8b3239d (= mod) and pushed to iosifnicolae2/better-tasks (9d28962..8b3239d). Then e4b2ec2 (drop `.supermanager/` from .gitignore) pushed.
- 2026-10-03: Removed worktrees T-001/T-002 (clean), branches sm/T-001, sm/T-002, mod (local + bringes remote). Remote bringes removed; `mine` renamed to `origin`; main tracks origin/main.
- 2026-10-03: bringes/supermanager refs checked: main 06b28f8, mod 8b3239d, tag v0.1.0 (e4f35a5): all in main. GitHub release v0.1.0 there (notes only, no assets), no issues/PRs. Tag v0.1.0 kept locally, not pushed to better-tasks.
- 2026-10-03: BLOCKED: repo delete; gh token lacks delete_repo. User runs `gh auth refresh -h github.com -s delete_repo`, then `gh repo delete bringes/supermanager --yes`.
- 2026-10-03: Untracked `.supermanager/` folder (old Python tool state: tasks, agents, state.json) still on disk; now shows in git status. Not deleted (user data).
- 2026-10-03: Checks: tsc ok, validate ok (warning: no version). `claude plugin test .` could not run: hooks rollout switch saved off in this process.
- 2026-10-03: User: will delete bringes/supermanager themselves (gh scope + delete). Push tag v0.1.0 to better-tasks. Delete the untracked .supermanager/ folder. Installed plugin updated and enabled by the user.
- 2026-10-03: User deletes bringes/supermanager themselves. Pushed tag v0.1.0 to origin. Deleted `.supermanager/` (no open files, no process, no tmux); git status clean apart from .claude/.
- 2026-10-03: "Rollout switch" = GrowthBook flag `tengu_plugin_hooks_modules` (default on), cached in ~/.claude.json `cachedGrowthBookFeatures` (time in `cachedGrowthBookFeaturesAt`). "saved off" = this process read it from that disk cache (no fresh payload) and the cache said false. A networked session refreshed it to true at 19:55:50; `claude plugin test .` then passed 167/167.
- 2026-10-03: main = all of mod, pushed to iosifnicolae2/better-tasks (only remote, as origin); mod, sm/* branches, old worktrees and .supermanager/ removed; tag v0.1.0 pushed. The user deletes bringes/supermanager themselves.
