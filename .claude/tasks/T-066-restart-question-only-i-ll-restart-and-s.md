---
id: T-066
title: "Restart question: only \"I'll restart\" and \"Skip\" (drop \"Done\")"
sprint: 2026-10-05
urgent: false
status: done
owner: self-update-2
rolled: 0
order: -2
created: 2026-10-06
---
## Goal
User (2026-10-06), after seeing the restart question: "remove done from the restart.. only i will restart and skip..".

T-064 made restart requests a question with Done / I'll restart / Skip. Drop "Done" everywhere: the plugin's restart question after a self-update, the agent-teams setup, and the lead rule in .claude/better-tasks/lead.md. The only options are "I'll restart" and "Skip". Regenerate docs/instructions.md and the test templates. Done: no restart question offers "Done", and the tests pass.

## Notes
Video: [T-066.mp4](../tasks_videos/T-066.mp4)
- 2026-10-06: Done (commit d0bda7c). "Done" is gone from the restart question after a self-update (now "I'll restart" / "Skip"), from the agent-teams setup prompt (hooks/setup.ts), and from the lead rule in lead.md (now "I'll restart" (or "I'll do it"), "Skip"). docs/instructions.md and tests/templates.gen.ts are regenerated. Checked end to end in an isolated session (tmux, real startup question, Yes): the question offers 1. I'll restart, 2. Skip; choosing I'll restart logs "v0.11.9 runs once you restart Claude Code." (<scratchpad>/a066/shots). BEFORE: T-064's capture with Done (<scratchpad>/a064e/shots). Tests: claude plugin test . 319 pass; instructions-doc current. Try: ~/t066-try.sh (remove: rm -rf <scratchpad>/try066 ~/t066-try.sh).
### For the user
Question:
T-066 Restart question without "Done"
What changed: when better-tasks asks you to restart, the answers are now only "I'll restart" and "Skip". The lead asks the same way.
To try it: paste this one line in a terminal. It builds a throwaway copy (about a minute) and opens Claude Code in it. Answer Yes to the update question; the restart question shows the two answers. "Not logged in" there is fine. Your own install is untouched.
~/t066-try.sh
Is everything OK?
- 2026-10-06: Finished: full tests pass (claude plugin test . 319 pass). Straight to main, so no PR; the commit is final (d0bda7c). Video made from the terminal captures.
- 2026-10-06: Restart question offers only "I'll restart" and "Skip" (self-update, agent-teams setup, lead rule)
