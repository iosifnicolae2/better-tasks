---
id: T-096
title: Spawn teammates in worktrees without sandboxing (a setting, on by default)
sprint: 2026-10-05
urgent: true
status: doing
owner: worktree-sandbox
rolled: 0
order: -4
created: 2026-10-07
---
## Goal
User's words: "also when spawning teammates add an option to use worktrees without sandboxing and use it by default as i see a lot of errors because of this..".

1. Find out what "sandboxing" means for a teammate spawned with isolation "worktree": e.g. the Bash sandbox (filesystem or network limits; the instruction that gh and git must stay in the worktree with no `cd` or `git -C`), the permission prompts, or the worktree being a separate directory the sandbox blocks. Find the errors it causes in recent transcripts (~/.claude/projects/*better-tasks*/ and the subagent transcripts; read-only), with counts. Use current Claude Code docs for the sandbox and worktree settings (Context7 or claude-code-guide), not memory.
2. Add a setting, e.g. `worktreeSandbox: false` meaning "worktrees without sandboxing", on by default, in the usual settings places. With it on, teammates in worktrees are spawned so the sandbox doesn't block their own worktree, the main checkout's caches or git/gh. Use the documented option: a per-agent setting, `dangerouslyDisableSandbox` on their Bash calls, or adding the worktree to the sandbox's allowed paths, whichever is right. Loosen the "must plainly stay in your worktree" rule only as far as the setting allows. Keep everything else the user's permission mode decides; never widen permissions beyond what the user configured.
3. Show it: the before errors and the after run, with a teammate in a worktree running git, gh, a build and tests without sandbox errors. Tests for the setting and its rule text.

This is the user's own repo: commit to main, with a review-only draft PR and a video. No release until the user approves. Tests: `sh scripts/test.sh`. Small bugs in your area: fix them here. Bigger or other-area ones: report them to the lead.

## Notes
- 2026-10-07: What "sandboxing" is here: Claude Code's worktree isolation checks, not the Bash sandbox (sandbox.enabled is off in every settings file of this user; no "Operation not permitted" errors anywhere). Docs (code.claude.com/docs/en/worktrees#how-claude-code-enforces-isolation): an agent spawned with isolation "worktree" gets four checks: no Edit/Write to main-checkout paths, no command whose cwd is the main checkout, no git redirected there (-C, --git-dir, GIT_DIR, cd), and no command whose git it can't verify ("Command shape ... You can't turn this check off"). No setting, frontmatter key or Agent input disables them; dangerouslyDisableSandbox only bypasses the Bash sandbox, so it doesn't help (and would widen permissions). A teammate's cwd can't be set either (agent.spawn: "A teammate runs in the session's"). So the documented way out: better-tasks makes the worktree itself (git worktree add) and spawns the teammate without isolation, told to work in it.
- 2026-10-07: BEFORE, refusals in transcripts (scratchpad/t096/errors.py, read-only): better-tasks 184 (156 "too complex to verify", 18 edits of the main checkout's files e.g. the task file, 6 cd/git -C into the main checkout, 4 other) in ~50 transcripts; church-hub 524 (440 too complex, 40 directory computed at runtime, 23 cd/-C main, 18 edits, 3 other). Too complex covers sed/ffmpeg/python/gh with a variable, subshells, heredocs, loops with $var.
- 2026-10-07: BEFORE (live, tmux socket t096, `claude --plugin-dir` on a `git archive HEAD` copy, scratch project scratchpad/t096/shop, gitFlow worktree-prs): the lead spawned teammate checker (isolation worktree) for T-001's 7 commands. Ran: git status, npm build + test, a commit. Refused by the guard: a subshell with git, a `{ gh …; git …; } > file` group, `n=1; sed -n ${n}p … && git log`, and the Edit of its task file in the main checkout. Capture: scratchpad/t096/cap/before-report.ansi.
