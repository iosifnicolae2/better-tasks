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
- 2026-10-07: Done (commits 15ce893, e90af3b). `sh scripts/test.sh` writes tests/templates.gen.ts (now git-ignored, untracked) from .claude/better-tasks/, then runs `claude plugin test .`. scripts/templates.ts exports writeTemplates, so it no longer has `--check`. scripts/instructions-doc.ts writes the copy into its own scratch from the .md files, renders into $TMPDIR/better-tasks-instructions.md and prints the path (`--open`); `--check` is gone. docs/instructions.md removed: only two README links needed it, and they now point to .claude/better-tasks/ and the on-demand page. CONTRIBUTING.md updated (the test command; the manual steps removed). Small bug fixed: instructions-doc rendered from the stale copy.
- AFTER (<scratchpad>/t089/after/after.txt): same lead.md edit + test, `sh scripts/test.sh` gives 348 pass with no regenerate step; the rendered page has the new line. Repo: test.sh 347 pass; tsc clean.
- No video: plugin users see no change. Not changed (rule text, lead-rules' area): contribute.md still says `claude plugin test <fork>`; in a fresh fork clone that fails to load core/rules tests until `sh <fork>/scripts/test.sh` runs once. Plain `claude plugin test .` the same in any fresh clone.
- PR: https://github.com/iosifnicolae2/better-tasks/pull/50

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/50
T-089 (#50) Tests and docs read the rules straight from .claude/better-tasks
A rule change needs no regenerate step: `sh scripts/test.sh` builds the tests' copy of the rules itself, since the test runner can't read files. The generated docs/instructions.md is gone. `bun scripts/instructions-doc.ts --open` shows that page on demand.
