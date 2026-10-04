---
id: T-003
title: Type check (tsc) runs out of memory
sprint: 2026-09-28
urgent: false
status: done
owner: typecheck
rolled: 0
order: -2
created: 2026-10-03
---
## Goal
`tsc` finishes at the default Node heap, quickly, with zero errors (including the stale generated mcp__better-tasks__* tool types), so teammates can type-check on every change. Bottleneck hit by both T-001 and T-002.

## Notes
- 2026-10-03: Cause: engine-laid `.claude-plugin/types/claude-code-mcp` lists the last session's MCP servers; stale (`mcp__supermanager__*`), so `on('tool.call', { tool: 'mcp__better-tasks__task_create' })` in pane.tsx widened `e` to all 276 tools; `next(e)` overload check = 17 s, 6.5 GB, 18M symbols. Regenerating it needs a mod reload (not allowed) and stays session-dependent anyway.
- 2026-10-03: Fix f17fde0: tracked root `tsconfig.json` (engine only lays one when missing) drops `claude-code-mcp` from `types`; own MCP tools fall back to the loose McpToolCallInputFallback. `incremental`, cache in `.claude-plugin/types/tsconfig.tsbuildinfo` (ignored). Command: `tsc -p .` = 0 errors, 0.95 s cold / 0.25 s warm (was OOM at 50 s; 23 s + 39 errors at 12 GB). plugin validate + test (167) pass.
- 2026-10-03: Option not taken: hand-declare our tools in `types/index.d.ts` `McpToolInputs` for typed args; would duplicate the schemas in hooks/tools.ts. Untracked `scripts/typecheck.sh` (12 GB heap workaround) is someone else's; now unneeded.
- 2026-10-03: tsc -p . finishes in ~1 s with 0 errors at the default heap: own tsconfig.json drops the stale session MCP types file and turns on incremental.
