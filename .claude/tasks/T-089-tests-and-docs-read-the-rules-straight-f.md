---
id: T-089
title: Tests and docs read the rules straight from .claude/better-tasks (no generated copy)
sprint: 2026-10-05
urgent: true
status: doing
owner: test-infra
rolled: 0
order: -2
created: 2026-10-07
---
## Goal
User's words: "make the tests and so on to use directly .claude/better-tasks".

Today, after every rule or skill text change, `bun scripts/templates.ts` copies the instruction templates into tests/templates.gen.ts, and `bun scripts/instructions-doc.ts` regenerates docs/instructions.md (see CONTRIBUTING.md). Make the tests, and anything else that uses a copy, read .claude/better-tasks/*.md directly, so a rule change needs no regenerate step. First find out why the generated copy exists (e.g. `claude plugin test` sandbox can't read files, or the bundle needs them inlined). If a copy is truly needed somewhere, generate it automatically (e.g. at test start or in release.sh) instead of by hand, and say why in one line. Then remove the manual step from CONTRIBUTING.md and the --check scripts that only guard the copy. docs/instructions.md: keep it only if something still needs it; otherwise say what replaces it. Keep `claude plugin test .` green.

This is the user's own repo: commit to main, with a review-only draft PR (no video needed if nothing user-facing changes; say so). No release until the user approves. Small bugs in your area: fix them here. Bigger or other-area ones: report them to the lead.

## Notes
- 2026-10-07: Why the copy exists: `claude plugin test` runs tests with no fs (types: "no fs, network or process"); probed: `node:fs`, `import()`, `import x from './a.md'` and `$.fs` all refuse in a test. So the tests need the rules as code; nothing else does (the plugin reads the .md at runtime).
- 2026-10-07: BEFORE (<scratchpad>/t089/before/before.txt): after a lead.md edit, `claude plugin test .` tests the old copy (the new line's test fails), templates --check says stale, and instructions-doc --check says "current": it renders from the stale copy too (small bug, fixed here).
