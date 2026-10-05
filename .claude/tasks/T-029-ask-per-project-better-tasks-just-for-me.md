---
id: T-029
title: "Ask per project: better-tasks just for me, or for the whole team in this project"
sprint: 2026-10-05
urgent: false
status: done
owner: worktrees-2
rolled: 0
order: -10
created: 2026-10-05
---
## Goal
User's words: "also in each project, ask the user if the better-tasks plugin should be installed only for him or also for other team members in the project.."

Goal: a setup question, asked once per project (saved in .claude/tasks/config.json like the other setup questions), in plain words:
- "Only me": keep the user-level install as today (nothing added to the repo).
- "Everyone on this project": add better-tasks to the project's shared Claude Code settings (.claude/settings.json: the marketplace in extraKnownMarketplaces and the plugin in enabledPlugins, checked into git), so teammates who open the project with Claude Code are offered it. Check Claude Code's docs for the exact keys and how teammates get prompted. Say plainly that this changes a shared, committed file, and commit it only with the user's yes.
Skip the question when the project already has better-tasks in its shared settings.

Done: the question appears in a new project, both answers do what they say; explain how to check.

## Notes
Video: [T-029.mp4](../tasks_videos/T-029.mp4)
- 2026-10-05 (worktrees-2): Done, on main 0cec5ab: 2e01594.
  - What changed: at the first start in a git project (first of the setup questions), header "Team": "Who on this project should get better-tasks?" with "Everyone on this project" / "Only me", each explained. Saved per project as `shareWithTeam` (true/false) in .claude/tasks/config.json. Skipped when the project's .claude/settings.json already enables better-tasks@better-tasks (a teammate's checkout), or outside a git repo.
  - "Everyone": adds `extraKnownMarketplaces.better-tasks` (github iosifnicolae2/better-tasks) and `enabledPlugins["better-tasks@better-tasks"]: true` to .claude/settings.json (other keys kept; a file that isn't JSON is left alone, with a log line), then `git add` + `git commit --only -- .claude/settings.json` (only that file, whatever else is staged). Not pushed. Log: "added to .claude/settings.json and committed it. Push it; each teammate then installs it once: claude plugin install better-tasks@better-tasks --scope project". Turning the setting on later in config also does it.
  - "Only me": nothing in the project changes.
  - Teammate side, per Claude Code docs (settings-example, plugins/install): after trusting the folder, the marketplace is registered and the plugin shows as enabled in project settings but not installed; each teammate installs it once with that command.
  - How to check: new git project without .claude/settings.json; start Claude Code: the Team question comes first. Everyone: .claude/settings.json has the two entries, `git log -1 --stat` shows one commit with only that file, config.json has "shareWithTeam": true. Only me: no settings file, "shareWithTeam": false, not asked again.
  - Checked live (tmux, scratch repo): question shown; Everyone wrote the file and made the commit (refs/heads/main created), config.json got shareWithTeam: true.
  - Not verified: a real teammate's machine opening the pushed project (the install prompt), only from the docs.
  - Tests: 263 pass (teaminstall.test.ts + 2 in core.test.tsx), tsc clean.
  - Conflict ahead: T-025 (PR #9) changes askToTurnOn; whichever merges second gets rebased (askToTurnOn keeps the `answers` labels; with T-025, "Decide later" comes first, so a stray Enter can't commit to the repo).
  - For config-docs (T-027): setting `shareWithTeam`, project-only (config.json), boolean. true = better-tasks is in the project's shared .claude/settings.json for everyone; false = only this user has it; unset = not asked yet (asked at the next start).
  - PR: https://github.com/iosifnicolae2/better-tasks/pull/11 (branch task/T-029)
- 2026-10-05 (worktrees-2): Rebased on main dd05e02 (T-025): commits now 421102e + 694899f (shareWithTeam added to the settings skill via scripts/settingsdocs.ts; team tests wait for the quiet prompt box). With T-025 the Team question shows "Decide later" first, so a stray Enter commits nothing. 268 tests pass, tsc clean; PR #11 force-pushed, mergeable.
- 2026-10-05 (worktrees-2): Rebased on main 967faca (T-026): commits now b7df59d + cbb1c47; settings.ts and settingsdocs.ts keep both prTemplate and shareWithTeam; skill regenerated. 274 tests pass, tsc clean; PR #11 mergeable.
- 2026-10-05: User (Request changes): "ask the user, should we install better-tasks inside this project? and then to ask if only for yourself or for all.. also add if the tasks should be be tracked in git or not (recommended is to have it in git)".
So the setup asks, in order, once per project, plain words:
1. "Use better-tasks in this project?" Yes / No. No: better-tasks stays quiet in this project (no other setup questions, no board/rules), saved so it isn't asked again; say how to turn it on later.
2. Only on yes: "Only for you, or for everyone on this project?" (today's question).
3. "Keep the task files (.claude/tasks/) in git?" Yes, recommended (shared history, teammates see tasks) / No (add .claude/tasks/ to .gitignore). Save the answer; apply it (gitignore line or not).
Keep T-025's "Decide later" first and the wait-while-typing behavior. Push to the same PR #11; update the settings skill.
- 2026-10-05 (worktrees-2): Request changes done: fe15c39 (pushed to PR #11, video remade, PR body updated). Setup order, once per project, each "Decide later" first:
  1. "Use better-tasks in this project?" (`useBetterTasks`, default true; new hooks/projectsetup.ts). No: no more questions; from the next start only the commands register (no tools), prompt.compose/prompt.submit/Agent hooks pass through untouched, one log line says how to turn it on ("useBetterTasks": true + restart, or delete the key to be asked again). Not asked in a project that has tasks already. Caveat: "No" writes .claude/tasks/config.json (that is where the answer lives).
  2. Only me / Everyone (`shareWithTeam`, unchanged).
  3. "Keep the task files in git?" (`tasksInGit`, git projects; Yes recommended). No: `<tasksFolder>/` appended to .gitignore (not committed); if git tracks task files already, the log line gives `git rm -r --cached <folder>`.
  - askToTurnOn now returns the answer it saved (true/false/undefined).
  - Settings skill: useBetterTasks, tasksInGit, shareWithTeam rows (scripts/settingsdocs.ts, regenerated).
  - Checked live (tmux, Claude Code 2.1.289, scratch git repo): order Use → Team → Task files; Yes/Only me/No → .gitignore got .claude/tasks/, config.json {useBetterTasks: true, shareWithTeam: false, tasksInGit: false}; No → config {useBetterTasks: false}, restart shows only the off line.
  - Tests: 279 pass, tsc clean.
  - For config-docs: useBetterTasks (bool, default true: false = quiet in this project), tasksInGit (bool, default true: false = task folder in .gitignore), both project-only in config.json, asked once per project.
- 2026-10-05: User (Request changes): "ask only one question, if better-tasks should be setup in the project so other team memebrs can use it, remove decide later.. by default the recommended option is everyone on this project, same fo rkeeping the tasks in git, two options, yes the default one".
So:
- Drop the "Use better-tasks in this project?" question (the useBetterTasks setting may stay, settable in config, not asked).
- One question: set better-tasks up in this project so other team members can use it? Two options: "Yes, everyone on this project (recommended)" first/highlighted, "No, only me".
- "Keep the task files in git?": two options, "Yes (recommended)" first/highlighted, "No".
- No "Decide later" in these. Lead's reading: apply the same to every setup question (recommended option first, no "Decide later"), keeping T-025's wait-until-not-typing guard, which is what stops stray Enters. Push to PR #11, update the settings skill, remake the video.
- 2026-10-05 (worktrees-2): Second request changes done: 9080cd9 (pushed to PR #11, video remade, PR body updated, mergeable).
  - The "Use better-tasks here?" question is gone; `useBetterTasks` stays as a config.json-only setting (false = quiet: commands only, no tools/rules/questions).
  - Team question: "Set better-tasks up in this project so other team members can use it too?" with "Yes, everyone on this project (recommended)" first / "No, only me".
  - Task files: "Keep the task files (.claude/tasks/) in git?" with "Yes (recommended)" first / "No" (No: folder added to .gitignore).
  - Every setup question: no "Decide later"; the recommended answer first (videos: Enable (recommended)/No; git flow: recommended flow first; IntelliJ: Yes first; off-screen: Enable first). T-025's wait-until-the-prompt-box-is-empty guard stays; a dismissed question saves nothing and comes back next session.
  - Checked live (tmux, Claude Code 2.1.289): Enter, Enter → .claude/settings.json written and committed, config.json {shareWithTeam: true, tasksInGit: true}, no .gitignore.
  - Tests: 278 pass, tsc clean. Settings skill regenerated (useBetterTasks: "Not asked").
- 2026-10-05: Setup asks per project: share better-tasks with everyone (recommended, commits .claude/settings.json) or only me; keep task files in git (recommended) or .gitignore; no "Decide later" in any setup question.
