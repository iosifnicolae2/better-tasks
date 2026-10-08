---
id: T-102
title: Wake-ups and team view scoped to the current project
sprint: 2026-10-05
urgent: false
status: done
owner: team-scope
rolled: 0
order: -2
created: 2026-10-08
labels: [team, wakeups]
---
## Goal
User's words: "make sure that you emit the wake up call only for the agents from that project, also the coordinator should see and coordinate only the teammates from the current project".

So: (1) the wake-up / status-check calls better-tasks emits must target only teammates belonging to the project they were spawned for, never agents from other projects running on the same machine; (2) the lead (coordinator) must see and coordinate only the current project's teammates — team_status and anything else that lists or messages teammates must filter by project.

This repo is better-tasks itself (the user maintains it): change it here on a branch, run `sh scripts/test.sh`, and follow the project rules in CLAUDE.md.

## Notes
Video: [T-102.mp4](../tasks_videos/T-102.mp4)
- 2026-10-08: The user saw two things: (b) the lead messaged an agent with the same name in another project's session (cross-session ListAgents/SendMessage reached past this project), and (c) a wake-up or status check fired in a session belonging to a different project. They gave no specific names. Fix both: the lead may only address, and wake-ups may only reach, this project's teammates and sessions.
- 2026-10-08: Findings: team_status and the status check read this session's agents ($.agent.list) and session state, so they never list another session's agents. The leak is elsewhere: (1) tasks are shared files, so a second lead session in the same project sees tasks owned by the other session's teammates (open-task lines, status check work/fingerprint, "act on an idle teammate"), and (2) SendMessage reaches any session on the machine by name (best-remote-desktop lead b42e01f8 messaged best-remote-desktop-3e and church-hub-f8 cross-session). Asked the lead for the exact symptom.
- 2026-10-08: PR: https://github.com/iosifnicolae2/better-tasks/pull/61
- 2026-10-08: BEFORE (live, tmux socket t102, `claude --plugin-dir` on a `git archive 29b7aec` copy, scratch projects scratchpad/t102/shop and other, where `other` had a session other-8c with a teammate login): a note on T-001, whose owner login was from an earlier session, gave the hint "Owner login is not running: tell it with SendMessage", and the lead tried. Asked to "find the session in the other folder and tell it…", the lead sent to other-8c with nobody naming it. Captures: scratchpad/t102/before*.
- 2026-10-08: Change, on branch t-102-team-scope (commits 090edb7, bd30121): a SendMessage guard (team.ts outsideTeam, wired in register.tsx). A message to an agent outside this session's team is refused. Teammates can never send outside the team; the lead can only when the user named that session this turn, in a message or in a question answer (turnState.userText, cleared at the end of each main turn). The note hint for an owner not on the team now says to route the task anew (tools.ts). lead.md Routing line and status-check.md say to message and wake only team_status's teammates. Tests: team.test.ts and rules.test.ts; 377 pass, tsc clean.
- 2026-10-08: Bug my change made, fixed: an answer to the lead's "Send to other-8c?" question was still refused, because only typed messages counted (bd30121 adds the answers).
- 2026-10-08: AFTER (live, same setup, the t-102-team-scope build): the note's hint says to route anew, and no SendMessage is tried. The unnamed send to other-8c is refused; the lead asks, the user picks "Send to other-8c", and it goes. When other-8c messages first and asks for a reply (a turn another agent started), the send is refused and the lead asks the user. Captures: scratchpad/t102/after*.
- 2026-10-08: Not changed: a second lead session in the same project still lists the other session's tasks (shared files). Filtering tasks by owner would also hide tasks owned by a finished earlier session's teammates, so I left it. The guard still stops the lead from waking those owners. Not checked live: a status check firing with the guard on; it runs the same path as an agent-started turn (empty userText), which I did check.
- Local build to try: `claude --plugin-dir /private/tmp/claude-501/-Users-iosif-Documents-Projects-better-tasks/a9e2d92c-d882-4ae5-b6c4-becf507c4ecc/scratchpad/t102/after-plugin` (or `git archive t-102-team-scope` of this repo).

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/61
T-102 (#61) Wake-ups and team view scoped to the current project
The lead now messages and wakes only its own project's teammates. A message to another Claude session is refused unless you named that session yourself this turn. Status checks and other agents can no longer set one off. A note on a task whose owner is gone now says to give the task to a current teammate.
- 2026-10-08: Accepted. Fast-forwarded main to the T-102 commits (main hadn't moved, so the rebase was a no-op). Full tests: 377 pass, tsc clean. Pushed to main (840564f..bd30121, which includes the lead's 29b7aec). Review PR #61 closed; local branch t-102-team-scope and task/T-102-base deleted. Not released yet.
- 2026-10-08: The coordinator and teammates can now message only their own session's team. The coordinator can message another session only when the user named it in that turn. The note hint and the coordinator/status-check rules are scoped to the project. Review PR #61 is closed; the commits were fast-forwarded to main.
