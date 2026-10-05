---
id: T-026
title: "PR template: create one if the project has none (request, why, video first), or use the user's custom path"
sprint: 2026-10-05
urgent: false
status: done
owner: pr-template
rolled: 0
order: -7
created: 2026-10-05
---
## Goal
User's words: "make sure that if the project doesn't have a tempalte for the pr create one following industry best practices, make sure to also include what the user request at top, describe the why, what problem or feature was implemented, then the video, then the rest of needed details, keep it failry short but follow industry best practices.. allow the user to set a path to their own custom one.."

Context: the other session just set the PR description order in PR_BODY_RULES (hooks/gitflow.ts), PR_TEAMMATE_RULES (hooks/pullrequest.ts) and bin/task_pr.py: Asked for, Why, video, What changed, To test, Commits (commit 394d029, in v0.8.0). Build on that, don't redo it.

Goal:
- If the project has no PR template (.github/pull_request_template.md, .github/PULL_REQUEST_TEMPLATE/, docs/, root; GitLab's .gitlab/merge_request_templates/), better-tasks creates one following common practice: the user's request at top, why (problem or feature), the video, then what changed, how to test, and the remaining details (risk/notes, linked issue), fairly short. Ask the user before adding it to their repo, or say plainly when it's added.
- If the project has its own template, use it (fill it in; the video still goes right after the request/why).
- A setting for a custom template path (per project, in .claude/tasks/config.json, with a row on the config page).
Done: explain in plain words what changed and how to check it on a real PR.

## Notes
- 2026-10-05: Video: [T-026.mp4](../tasks_videos/T-026.mp4)
PR: https://github.com/iosifnicolae2/better-tasks/pull/10
Done (branch task/T-026, rebased on main 24af90c with #8).
- What changed: better-tasks' template templates/pull_request_template.md (Asked for, Why, video, What changed, To test, Notes, Commits). hooks/prtemplate.ts picks the template: prTemplate path > project's own (GitHub/GitLab places) > better-tasks'. prBodyRules (gitflow.ts) tells teammates to fill it in, request+why on top, video right after. Settings page "This project" row "PR template": opens it; with none, Enter adds .github/pull_request_template.md (a log line says so); never added without that Enter. New project setting prTemplate (config.json only, default ""), in the settings skill. task_pr.py puts the video after any template's request/why headings.
- Commits: d0f2731 (feature + tests), 9e2d462 (README picture), bdabd24 (settings skill line).
- To test: /better-tasks config -> "PR template" row reads "better-tasks' · add to repo"; Enter -> file created and opened, row shows its path. Set "prTemplate": "<existing file>" -> row shows it. Real PR: PR #10's own body fills in the new template.
- Checked: 267 tests pass, tsc clean, settings-doc regenerated.
- Not verified: a teammate's PR built end to end from a project's own template (the rules are prompt text, covered by unit tests only). task_pr.py open without --body-file still writes its own short body, not the template.
- 2026-10-05: PRs follow a template (prTemplate path > project's own > better-tasks' templates/pull_request_template.md: Asked for, Why, video, What changed, To test, Notes, Commits); config row can add it to the repo on Enter.
