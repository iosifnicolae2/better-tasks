# Finished tasks
One row per finished task; grep it, don't read it: `grep -i <word> docs/tasks.md`.

date | teammate | task | summary | commits | session
--- | --- | --- | --- | --- | ---
2026-10-03 | coordinator-rules | T-002 Coordinator goal: finish tasks, monitor, fast builds and tests | Coordinator rules now state the goal: finish every task fast; monitor, ask questions, clear blockers such as slow/broken builds and tests (also in Status checks). | 9fadfff, 7ea68e6 | session abdb217d-e16f-4909-9ee0-a7c3f68b38d6 teammate coordinator-rules
2026-10-03 | typecheck | T-003 Type check (tsc) runs out of memory | tsc -p . finishes in ~1 s with 0 errors at the default heap: own tsconfig.json drops the stale session MCP types file and turns on incremental. | f17fde0 | session abdb217d-e16f-4909-9ee0-a7c3f68b38d6 teammate typecheck
2026-10-03 | coordinator-rules | T-004 Coordinator questions: confirm user actions, free-text option on accept | Coordinator rules: user actions are asked with AskUserQuestion (Done/Skip); accept questions stay Accept/Request changes, free text via the built-in choice. | c55c8ec, 7f53a89, 33c7f3b | session abdb217d-e16f-4909-9ee0-a7c3f68b38d6 teammate coordinator-rules
