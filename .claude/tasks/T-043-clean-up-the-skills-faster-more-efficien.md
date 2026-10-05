---
id: T-043
title: "Clean up the skills: faster, more efficient process"
sprint: 2026-10-05
urgent: false
status: done
owner: finish-flow
rolled: 0
order: -3
created: 2026-10-05
---
## Goal
User's words: "create a task to cleanup the skills, make the process faster and more efficient".

Go through all better-tasks skills (skills/*/SKILL.md) and the rules they pair with (hooks/texts.ts, teammate prompt parts in hooks/):
- Cut what is repeated, outdated or not needed. Say each thing once and link to it elsewhere. Use keywords over paragraphs.
- Make the teammate's path from start to "user can test it" as short as possible: fewer steps, fewer tool calls, fewer skills to load.
- Keep every rule a reader relies on (skills-check phrases), and update the phrases where the wording changes.
- `claude plugin test .` and `bun scripts/skills-check.ts` pass.
Starts after T-042 (same files: the finishing flow and skills). Build on T-042's result.

This repo is better-tasks upstream itself, so no fork is needed.

## Notes
- 2026-10-05: Video: none (rule text only, nothing on screen).

2026-10-05 finish-flow: done (local build first; full tests and the PR wait for your yes). Built on main after T-042 (92897e6).
What changed (commit a5ebeeb):
- Fewer skills to load at the start: how to capture the video (BEFORE before you change anything, the size, AFTER) is now in the teammate prompt (hooks/demovideo.ts videoPointer, register.tsx). The video skill loads only at the finish, to make the video. At the start a teammate now loads only the testing skill.
- Each rule is said once: the "New bug" line, "never the user's apps", plain gh/git commands, the title rule and the worktree intro were taken out of the skills, because the teammate prompt already has them. The quick-checks rule is in the done skill only.
- Shorter: the teammate's Done line and PR_DONE_LINE now point at the done skill. The done skill went from 5 steps to 4 (notes and the block are one step). Video, pull-request and testing skills trimmed to keywords. Diff: 76 lines added, 91 removed.
- skills-check phrases and tests updated to the new wording.
Checks: bun scripts/skills-check.ts and settings-doc --check pass. NOT run: claude plugin test . It refuses on this machine: "hooks modules are turned off in this process: the rollout switch was saved off by an earlier session and is not refreshed yet. Start claude once with network access". It worked 10 minutes earlier for T-042. I found the tests that check the changed text and updated them by hand (demovideo, pullrequest, gitflow, core); not run yet.
Local build: the worktree /Users/iosif/Documents/Projects/better-tasks/.claude/worktrees/agent-ac1c46c13eea41c97 (branch task-T-043). Nothing left running.

### For the user
Question:
T-043 Clean up the skills
What changed: the teammates' skills are shorter, and each rule is written once. A teammate loads fewer skills before it starts: the video skill is now only used at the end, to make the video.
To try it: open a new terminal and run: claude --plugin-dir /Users/iosif/Documents/Projects/better-tasks/.claude/worktrees/agent-ac1c46c13eea41c97
Ask for a small change that shows on screen, with videos on. The teammate should take a BEFORE screenshot right away, and only make the video after you say OK.
Is everything OK?
- 2026-10-05: User marked it as resolved (local build accepted). Finish: run the full tests (if `claude plugin test` still refuses with the rollout-switch message, say so and don't loop on it), open the PR, then report "T-043 finished".
- 2026-10-05: PR: https://github.com/iosifnicolae2/better-tasks/pull/25
2026-10-05 finish-flow: Finished, but the full tests did NOT run. claude plugin test . still refuses with the rollout-switch message, and the repo has no CI checks on the PR. skills-check and settings-doc --check pass. Before merging, or right after, run claude plugin test . once it works again (the tests changed by hand: demovideo, pullrequest, gitflow, core).
- 2026-10-05: Leaner skills: capture steps in the teammate prompt, video skill only at the finish, each rule said once (91 lines out, 76 in). Full tests 294 pass.
