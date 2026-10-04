---
id: T-009
title: Routing: drop context limit and handoff, pick teammates by knowledge and load
sprint: 2026-09-28
urgent: false
status: done
owner: routing-2
rolled: 0
order: 0
created: 2026-10-04
---
## Goal
Remove the context-limit and HANDOFF rules from the coordinator instructions. Instead tell the lead to route smartly: send work to a new teammate when the needed knowledge differs from what existing teammates hold, or when a teammate is busy or has worked a lot (tired); otherwise reuse the owner.

## Notes
- 2026-10-04: Status check: the old owner "routing" was gone with no commits. Restarted with a fresh teammate, routing-2.
- 2026-10-04: Done. b3b1b29 routing by judgment: new Routing rules (reuse owner if knowledge fits and it has room; new teammate for different knowledge, busy, or worked a lot; cache warmth a soft hint), SendMessage never refused (cold-cache refusal gone too), no NO NEW WORK markers, HANDOFF line dropped from teammate text; a successor ("login-2") gets its predecessor's transcript path added to its prompt. 92f9979 contextLimit setting gone (settings, pane row, plugin.json, board warning colour), tests updated, screenshots redrawn. validate + tsc + 166 tests pass.
- 2026-10-04: Routing by judgment: no context limit, no HANDOFF, no SendMessage refusal; new teammate when knowledge differs or the owner is busy or has worked a lot; contextLimit setting removed. Released as v0.3.0.
