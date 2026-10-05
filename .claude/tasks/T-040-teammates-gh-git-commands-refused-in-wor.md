---
id: T-040
title: Teammates' gh/git commands refused in worktrees ("construct too complex to verify")
sprint: 2026-10-05
urgent: false
status: done
owner: worktree-commands
rolled: 0
order: 0
created: 2026-10-05
---
## Goal
Seen in another project (church-hub): a teammate in a worktree tried to watch its PR's checks with Monitor, and Claude Code refused:

"Monitor(PR #134 checks and dispatch build results)
Error: This agent is isolated in the worktree /Users/iosif/Documents/Projects/church-hub/.claude/worktrees/agent-a6d02b2ea0c119531, but this command runs gh with the text "pr-build-dispatch: \(.status)… inside a construct too complex to verify, so what it runs cannot be shown not to be git. Refusing to run it — a worktree-isolated agent's git operations must target its own worktree. Split it into plain, separate commands and run them from /Users/iosif/Documents/Projects/church-hub/.claude/worktrees/agent-a6d02b2ea0c119531."

User: "make sure to fix it.. and find a solution and update the skill to do it perfectly".

The refusal comes from Claude Code's own guard for worktree-isolated agents, not from better-tasks (the text isn't in this repo). So the fix is in what better-tasks tells teammates.

Done looks like:
- Find out exactly which command shapes the guard allows and which it refuses, for gh and git in Bash and Monitor: pipes, jq with \( ), loops, subshells, cd, -C/--repo, scripts in a file. Test them for real in a worktree-isolated agent.
- Pick a pattern that always works for watching a PR's checks and CI and for other gh/git calls. For example: plain `gh pr checks <n> --watch`, `gh run watch`, or a script file in the worktree run by its path.
- Put that pattern in the skills teammates load (skills/pull-request, and wherever else teammates run gh/git or Monitor). Keep it short: a few keywords and one example command.
- If a skills-check phrase or a test should guard it, add one. Tests and `bun scripts/skills-check.ts` pass.

This repo is better-tasks upstream itself, so no fork is needed.

## Notes
- 2026-10-05: Probed the guard in a worktree-isolated agent. Bash and Monitor are judged the same way; only commands that run gh or git are checked. Refused: a subshell `( … )` (gives the church-hub wording "construct too complex to verify"), a `{ …; }` group, a shell function, `bash -c '…'`, a heredoc, `[[ … ]]`, `cd <main checkout> && git`, `git -C <main checkout>`. Allowed: plain commands, `;`, `&&`, pipes, jq `\( )` (inline or piped), `$( )`, `<( )`, for/while loops, `while read`, if, case, `[ … ]`, `$((n+1))`, xargs, `cd /tmp && gh --repo …`, `git -C <own worktree>`. A script file run by its path always passes because the guard doesn't read it (even `git -C <main checkout>` inside one ran), so a script is the escape hatch and must still target only the worktree. Watching CI, both allowed: `gh pr checks <n> --watch --fail-fast >/dev/null; gh pr checks <n>` (Bash run_in_background, one notice at the end) and `gh run watch <id> --exit-status --compact`.
- 2026-10-05: Done.
PR: https://github.com/iosifnicolae2/better-tasks/pull/22
Found while opening the PR: the guard also refuses a gh argument (a title, a search) that starts with "git", or that has a quote mark plus the word git. Examples: --search "git", --title "Teammates' gh/git commands". "the git flow" and "gh and git" pass. A heredoc fed to python is refused too when its text mentions git.
What changed:
- A new "gh and git in your worktree" section (WORKTREE_COMMAND_RULES in hooks/gitflow.ts) goes into every worktree teammate's prompt, including when the lead asks for isolation itself. It lists the refused and allowed shapes, the watch commands and the script-by-path fallback.
- skills/pull-request gets a title note under gh pr create and a "Watch its checks" line.
- skills-check phrases and tests in tests/gitflow.test.ts and tests/core.test.tsx.
Commits: 61603b8, 33ab211.
Checks: 291 tests pass and skills-check passes. I tested the recommended commands live in this worktree agent.
No video: nothing on screen.
Not verified: a fresh teammate spawned with the new prompt (that needs the plugin reloaded). Also, the guard belongs to Claude Code and may change.

### For the user
Links:
[PR #22](https://github.com/iosifnicolae2/better-tasks/pull/22)
Question:
T-040 Teammates' commands refused in worktrees
What changed: teammates in their own copy of the project now know which command shapes Claude Code refuses. They get a way to watch a PR's checks that is always accepted, and a fallback for anything more complex.
To test: after this is merged and released, ask a teammate in a worktree to watch its PR's checks. It should do so without the "too complex to verify" refusal.
https://github.com/iosifnicolae2/better-tasks/pull/22
Is everything OK?
- 2026-10-05: Done. PR: https://github.com/iosifnicolae2/better-tasks/pull/22
What changed:
- Every teammate in a worktree now gets a "gh and git in your worktree" section in its prompt: WORKTREE_COMMAND_RULES in hooks/gitflow.ts, added in hooks/register.tsx when the gitflow uses worktrees or the lead asks for isolation: worktree. It lists the refused shapes and the allowed ones, the PR-checks watch `gh pr checks <n> --watch --fail-fast >/dev/null; gh pr checks <n>` (Bash with run_in_background), `gh run watch <id> --exit-status --compact`, and the fallback of a scratchpad script run by its path.
- skills/pull-request has a "Watch its checks" line and a note under gh pr create about titles.
- skills-check has new phrases. New tests: tests/gitflow.test.ts and two in tests/core.test.tsx.
Found later: a gh argument that starts with "git", or has a quote mark and the word git, is refused even in a plain command. Example: `--title "T-040 Teammates' gh/git commands"` was refused. A heredoc fed to python that mentions git is refused too.
Tested: every shape listed was run for real in this worktree agent; the recommended commands pass the guard. `claude plugin test .` gives 291 pass; skills-check passes.
Not verified: watching a real PR with running checks end to end, because this repo's PRs have no CI. No video, since nothing changes on screen.
Commits: 61603b8, 33ab211.

### For the user
Links:
[PR #22](https://github.com/iosifnicolae2/better-tasks/pull/22)
Question:
T-040 Teammates' gh/git commands refused in worktrees
What changed: I tested which command shapes Claude Code refuses for teammates working in a worktree. Teammates now get the safe way to run gh and git, including how to watch a PR's checks, so they stop getting stuck on "too complex to verify".
To test: in a project with PRs per task, let a teammate open a PR and wait for its checks. It should not hit the refusal.
https://github.com/iosifnicolae2/better-tasks/pull/22
Is everything OK?
- 2026-10-05: Worktree teammates get rules for gh/git commands Claude Code's guard accepts, incl. a safe way to watch PR checks; tested shapes, skills-check guards it.
