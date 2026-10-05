---
id: T-028
title: Video and PR rules become skills teammates load when needed; slim the coordinator's rules
sprint: 2026-10-05
urgent: false
status: done
owner: skills
rolled: 0
order: -9
created: 2026-10-05
---
## Goal
User's words: "also, the video or pr acn be skills.. loaded dynamically by teammates.. offload work on the teammates so that the cordinator is focused on managing them"

Today the video rules (hooks/demovideo.ts), testing rules (hooks/testenv.ts) and PR rules (hooks/pullrequest.ts, hooks/gitflow.ts PR_BODY_RULES, bin/task_pr.py) are pasted into every prompt, the lead's included.

Goal:
- Ship skills in the plugin (e.g. "task-video" for recording the before/after video, test env/off-screen recipes; "task-pr" for opening the PR, its description/template, video hosting). Teammates load them when they reach that step; the spawn prompt keeps only a one-line pointer ("when done, load the task-video skill").
- Move work off the coordinator: anything the lead does today that a teammate can do (writing PR text, preparing the video link, updating a PR after conflicts, putting the Video/PR lines in the task file) moves to the teammate. The lead's rules keep only managing: filing, routing, asking the user, merging/closing.
- The lead's prompt gets shorter; say by how much.
- Settings still apply (video quality, off-screen, git flow, PR template path): the skill reads them, or the pointer passes them.

Done: a teammate run that loads the skills and makes a video + PR; before/after size of the lead's and the teammate's injected rules; explain in plain words.

## Notes
- 2026-10-05: Lead OKs the plan (scratchpad T-028-plan.md): step 1 with the register.tsx change; step 2 items 1-3 now; item 5 (contribute rules as a lead skill better-tasks:contribute) yours too, contribute's owner is gone; item 4 (PR_COORDINATOR_RULES / pull-request skill) after pr-template's T-026 merges. Main is 24af90c (T-027 settings skill merged: skills/settings). The "For the user" block must keep T-021's rule: links both above the question (markdown labels) and inside it (bare url, own line).
- 2026-10-05: (skills) Part 1 done on branch worktree-agent-a78a26a89aa6aede7 (on main 24af90c), commits 6160e8c, ac8f7cc. Not pushed yet; the PR comes with the pull-request skill.
  - New skills: skills/video, skills/testing, skills/done (teammates), skills/contribute (lead); all user-invocable: false, called better-tasks:<name>. Text moved from demovideo.ts, testenv.ts, texts.ts, contribute.ts.
  - Prompts keep one pointer each. Settings still apply: a skill.prompt hook (register.tsx, hooks/skills.ts) fills in the plugin path and puts "## Settings" under the skill's title (video quality + capture size; off-screen on/off; upstream PR answer).
  - The lead no longer writes the user's question: the teammate's done skill writes a "For the user" block (Links: markdown; Question: bare urls on their own lines, T-021's rule); the lead pastes it, and sends it back if a link is missing. The lead's video rules (COORDINATOR_RULES) are removed.
  - Size (worktree-prs, videos on, off-screen on): teammate 1445 -> 784 words (-46%); lead 1490 -> 1229 (-18%). The PR skill should bring the teammate to ~400 and cut the lead's PR text a bit more.
  - Tested: claude plugin test . (264 pass), tsc clean; live: claude -p --plugin-dir <worktree> loading the 4 skills, also in parallel: each gets its own settings and real paths. A first version put the settings above the title, and when skills loaded back to back the model read them as the previous skill's; fixed in ac8f7cc.
  - Not verified yet: a full teammate run that loads the skills and makes a video + PR (needs the pull-request skill). No video for this part: it changes prompt text only, nothing on screen.
- 2026-10-05: User on the throwaway repo: "why you need a new repo, test it here". So no new repo: the full run happens in this repo (iosifnicolae2/better-tasks). Make T-028's own video and PR #… by following the new skills (better-tasks:video, better-tasks:testing, better-tasks:pull-request, better-tasks:done) loaded fresh, as a teammate would; that PR is the end-to-end proof.
- 2026-10-05: Video: [T-028.mp4](../tasks_videos/T-028.mp4)
PR: https://github.com/iosifnicolae2/better-tasks/pull/12
(skills) Done. Commits on task/T-028 (rebased on main 967faca): 6e4e609, e44d767, 5b03d6d, 1e9d556, 1ebb5d4.
- What changed: five skills in skills/: testing, video, pull-request, done (teammates), contribute (lead), loaded only when their step comes; the prompts keep a one-line pointer to each. A skill.prompt hook fills in the plugin path and puts the settings in force under the skill's title. The teammate writes the "For the user" block; the lead pastes it. scripts/skills-check.ts (in release.sh) checks the skill texts, since tests can't read files.
- Size, this project's settings (PR per task, videos on, off-screen off): teammate 1282 -> 434 words (-66%), lead 1458 -> 1183 (-19%). With off-screen on: teammate 1494 -> 438, lead 1490 -> 1215.
- End-to-end runs: (1) a sandbox project (scratchpad e2e/counter, no remote): a headless lead filed the bug and spawned a teammate. The teammate loaded video, pull-request and done, fixed the bug, made T-001.mp4 and wrote a correct "For the user" block; the lead put it in the task file. (2) This PR: the four skills loaded fresh in this repo with the worktree's plugin (their exact texts in the scratchpad's loaded/); I followed them: off-screen frames from headless Playwright, demo-video.sh, push, gh pr create --attach.
- Fixes those runs found: the sandbox teammate skipped the testing skill (the pointer now says "before you first run, test or capture", 1e9d556), and a teammate in a worktree can't edit the task file (the skills now say to use task_note, 1ebb5d4).
- Tests: claude plugin test . 272 pass, tsc clean, skills-check clean, settings-doc --check current.
- Not verified: a lead in a live interactive session pasting the block into AskUserQuestion (the headless lead was told not to ask). A plugin run from --plugin-dir doesn't see the user's saved plugin options (another plugin id), so I mirrored them in a temporary config.json for the run.

### For the user
Links:
[PR #12](https://github.com/iosifnicolae2/better-tasks/pull/12)
Question:
T-028 Video and PR rules become skills
What changed: teammates load the video, testing, PR and reporting how-tos only when they reach that step, so their prompt is a third as long. The lead no longer writes the test question: the teammate writes it and the lead pastes it.
To test: open the PR, watch its video, then on the next finished task check the question you get comes with its links.
https://github.com/iosifnicolae2/better-tasks/pull/12
Is everything OK?
- 2026-10-05: Video, testing, PR, done and contribute how-tos are skills loaded when needed; teammate rules -66%, lead -19%; teammates write the user's test question, the lead pastes it.
