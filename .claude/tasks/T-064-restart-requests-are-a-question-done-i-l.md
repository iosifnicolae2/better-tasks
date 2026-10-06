---
id: T-064
title: "Restart requests are a question: Done / I'll restart / Skip"
sprint: 2026-10-05
urgent: false
status: done
owner: self-update-2
rolled: 0
order: -3
created: 2026-10-06
---
## Goal
User's words (2026-10-06), after I asked in plain text for a restart: "when asking to restart, ask a question and let the user skip or say done", then "or say i will restart".

The rule for better-tasks' instructions, in .claude/better-tasks/lead.md and wherever restarts are asked:
- When the user must restart Claude Code, or do a manual step, the lead asks with AskUserQuestion. The options are "Done", "I'll restart" (later, on their own) and "Skip".
- A long command goes in the reply text, not inside the question box. Copying it from the box once pasted a "│" border.
- Also check the plugin's own restart line after an update (restartLine in hooks/updatecheck.ts) and anything else that tells the user to restart, so they fit this.

Done: the template says it in one short line, the restart prompts follow it, and the tests pass.

## Notes
Video: [T-064.mp4](../tasks_videos/T-064.mp4)
- 2026-10-06: User: "update your short update instructions to ask that question..". After a successful self-update, the plugin's short "restart" instruction (restartLine and the update flow in hooks/register.tsx and hooks/updatecheck.ts) becomes that question: Done / I'll restart / Skip. Do the same for fix-update.sh's closing message if it tells the user to restart.
- 2026-10-06: User: fix the update-commit bug in this task. After a successful update, "Committing it failed: . Commit it yourself." appears when the project already pins the offered release but the install is older: nothing to commit, so git exits 1 with an empty message. When there is nothing to commit, the updater should say nothing about committing.
- 2026-10-06: Done (commits 17d1bb7, 87d291f). After a self-update the plugin logs "better-tasks: updated to vX." plus the pin note, then asks "better-tasks vX is installed. Restart Claude Code to use it: quit, then run claude --continue." with Done / I'll restart / Skip (header Restart). "I'll restart" logs "better-tasks: vX runs once you restart Claude Code."; Done and Skip say nothing more. The agent-teams setup prompt (hooks/setup.ts) now has Claude ask the restart with AskUserQuestion and the same options. lead.md has one line: a restart or other step only the user can do is a question, Done / I'll restart (or I'll do it later) / Skip, with a long command in the text before it, never in the box. docs/instructions.md and tests/templates.gen.ts are regenerated. fix-update.sh can't ask: it's a shell script, and an answer there would go nowhere. Its last line now says how to restart; the question is the lead's, per the new rule. Checked in isolated sessions (tmux, the real startup questions, Yes, then "I'll restart"). Before: <scratchpad>/b064/shots (a plain log line). After: <scratchpad>/a064/shots (the question, then the note). Captures are terminal text (.ansi/.txt) for the video at the finish. Tests: claude plugin test . 318 pass; instructions-doc --check current. Try: ~/t064-try.sh (remove: rm -rf <scratchpad>/try064 ~/t064-try.sh). Not verified: a real restart after "Done" (the question can't know whether the user restarted).
- 2026-10-06: Empty-commit bug fixed here too: when the project already pins the offered release but the install is older (a teammate who pulled the pin bump), Yes updated the install, then tried to commit an unchanged file: "Committing it failed: . Commit it yourself." Now it updates the install, says only "updated to vX." and commits nothing. New core test; claude plugin test . 319 pass. Checked end to end with the project pinned to v0.11.8 and 0.11.3 installed. Before (588f1b4): the failed-commit line, <scratchpad>/b064e/shots. After: "updated to v0.11.8.", no commit, then the restart question, <scratchpad>/a064e/shots.
### For the user
Question:
T-064 Restart requests are a question
What changed: after better-tasks updates itself, it asks you to restart with three answers: Done, I'll restart, Skip. The lead asks the same way whenever it needs a restart or another step from you, with any long command written above the question, not inside it. Also gone: "Committing it failed" after an update, when the project already had the new version.
To try it: paste this one line in a terminal. It builds a throwaway copy (about a minute) and opens Claude Code in it. Answer Yes to the update question: it says "updated to v0.11.8." with no commit error, then asks you to restart. "Not logged in" there is fine. Your own install is untouched.
~/t064-try.sh
Is everything OK?
- 2026-10-06: Finished: full tests pass (claude plugin test . 319 pass; instructions-doc current). Straight to main, so no PR: the commits are final (17d1bb7, 87d291f, 7401ef3). The video is made from the terminal captures (before: 588f1b4, after: this code), rendered to 1920x1080 images.
- 2026-10-06: Restart requests are a question (Done / I'll restart / Skip) after a self-update and in the lead rules; no empty commit or error when the pin is already at the release
