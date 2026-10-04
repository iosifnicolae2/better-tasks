---
id: T-004
title: Coordinator questions: confirm user actions, free-text option on accept
sprint: 2026-09-28
urgent: false
status: done
owner: coordinator-rules
rolled: 0
order: -1
created: 2026-10-03
---
## Goal
Coordinator rules: whenever the user is asked to do something themselves (a live test, a command to run, a setting to change), the coordinator asks with AskUserQuestion, so the user confirms when it's done (or declines) and the reply comes back as an answer.

## Notes
- 2026-10-03: Rule added in Finishing (hooks/texts.ts): user-side actions go through AskUserQuestion, Done (with result) / Skip. validate ok, 167/167 pass.
- 2026-10-03: User: "and alwasy when you request to accept, add a third option to allow riting anything.." → accept questions get a third option for a free-text reply, besides Accept / Request changes.
- 2026-10-03: Accept question gets a third option "Write a reply" (free text, goes to the teammate). validate ok, 167/167 pass.
- 2026-10-03: User review of 7f53a89: doesn't like the custom "Write a reply" option (it doesn't open a note). Drop it; rely on AskUserQuestion's built-in free-text choice and notes.
- 2026-10-03: User review: custom "Write a reply" only sends its label. Dropped; rules now point to the built-in free-text choice; a typed answer or note goes to the teammate. validate, tsc, 167/167 ok.
- 2026-10-03: Coordinator rules: user actions are asked with AskUserQuestion (Done/Skip); accept questions stay Accept/Request changes, free text via the built-in choice.
