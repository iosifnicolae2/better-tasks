---
id: T-095
title: "Analyse church-hub and best-remote-desktop sessions: where time and tokens go, and short rules to work faster"
sprint: 2026-10-05
urgent: true
status: doing
owner: session-analysis
rolled: 0
order: -3
created: 2026-10-07
---
## Goal
User's words: "spawn a task to analyse churchub and best remote desktop projects and check dynamically where it was spend most of the time, on which tool calls.. then provide me a report with short generic instructions on what to do better to fix the bottlenecks and use fewer tokens, make fewer mistakes and fix the problem or implement the feature faster".

Data: the Claude Code session transcripts of those projects, in ~/.claude/projects/-Users-iosif-Documents-Projects-church-hub/ and ~/.claude/projects/-Users-iosif-Documents-Projects-best-remote-desktop/ (JSONL, with subagent transcripts too). Read-only: never change or delete them.
1. Measure it with a script, not by eye: per tool (Bash and its main commands, Read, Edit, Agent, the browser and mobile tools, builds, tests, recordings and so on) give the count, wall time (from timestamps), tokens in and out, and the share of the total. Also measure:
   - the longest single calls and the idle gaps;
   - retries and repeated failing calls (the same command failing again);
   - context growth and compactions;
   - time waiting on builds, device or simulator runs, and video;
   - mistakes: reverted edits, wrong turns, a fix that took several tries.
2. Report: .claude/tasks/T-095/report.md. Up top, the top bottlenecks with numbers. Then short, generic instructions, principles only like the better-tasks rules, to: fix those bottlenecks, use fewer tokens, make fewer mistakes, and get to the fix or feature faster. Mark which ones could become better-tasks rules.
3. Privacy: the transcripts hold the user's code and data. The report quotes no secrets, tokens, personal data or customer content, only tool names, commands in general form, and numbers.
No code change, PR or video is needed; the report is the result. Keep the scripts in the task folder too, so the analysis can be run again.

## Notes
- 2026-10-07: analyse.py (task folder) measures all 3,032 transcripts (worktree and scratchpad folders included) in ~5 s; tables.md holds every table, with a Headline section per project. Rerun: `python3 -I .claude/tasks/T-095/analyse.py` (`--json` for raw numbers).
- 2026-10-07: writing report.md was refused by a guard on report files written by subagents; the report text went to the lead in the done message, to save as T-095/report.md.
