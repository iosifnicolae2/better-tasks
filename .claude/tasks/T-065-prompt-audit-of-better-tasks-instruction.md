---
id: T-065
title: Prompt audit of better-tasks' instructions (report + proposed diff)
sprint: 2026-10-05
urgent: false
status: done
owner: prompt-audit
rolled: 0
order: -4
created: 2026-10-06
---
## Goal
User ran "/claude-api prompt-audit" in the better-tasks repo (2026-10-06).

Run the claude-api skill's prompt-audit subcommand (Skill tool, skill "claude-api", args "prompt-audit") over every instruction text better-tasks ships or loads:
- the templates in .claude/better-tasks/ (lead, teammate, status-check, done, testing, video, pull-request, contribute);
- skills/*/SKILL.md;
- the agent definitions (teammate-easy/normal/hard);
- the CLAUDE.md block the plugin adds;
- the MCP tool descriptions in hooks/;
- the project CLAUDE.md.
docs/instructions.md is the rendered view of all of them and helps with the inventory.

Output, as the subcommand defines: an audit report (findings with file:line, pattern, why it's dated or contradictory, confidence) and a proposed diff. Don't apply edits: the user decides afterwards. Keep in mind the user's style rules from T-058: principles only, details as script defaults. Save the report as a Markdown file in the task's notes folder or the scratchpad, and link it in the For the user block.

## Notes
- 2026-10-06 (prompt-audit): Audit done, read-only, no repo files edited, no commits. Report: /private/tmp/claude-501/-Users-iosif-Documents-Projects-better-tasks/53ae7dac-9013-42a3-a974-c8490897e797/scratchpad/T-065-prompt-audit.md. Proposed diff: .../scratchpad/T-065-proposed.diff (11 files, ~31 lines, one hunk per finding, regenerated docs/instructions.md and tests/templates.gen.ts included). On a scratch worktree of 87d291f it applied cleanly; `claude plugin test .` gave 318 pass, 0 fail, and both generated docs were current. If T-064 changes lead.md first, re-apply its one-line hunk by hand. Nothing shows on screen, so there is no video and no local build.
- 2026-10-06: Result: no dated prompting (no caps pressure, scaffolds or suppressors). 11 findings, mostly stale facts left behind by T-051 and T-058, plus 3 flags.
- 2026-10-06: Accepted; all 11 fixes applied in 490945c. They don't touch T-064's files (it changed only hooks/register.tsx and tests/core.test.tsx after 87d291f). docs/instructions.md regenerated. Finished: full tests pass (319 pass, 0 fail); templates, instructions-doc and skills-check are all current.

### For the user
Question:
T-065 Prompt audit of better-tasks' instructions
What changed: nothing yet. The audit found no outdated prompting style, and 11 places where the instructions no longer match how better-tasks works now. The top three: a teammate that tries to close its own task is told the old way to report done; the project_init tool names files it no longer writes; and several lines promise a video when videos are off. Each fix is ready as its own small hunk, and all tests pass with them applied.
To try it: read the report, then pick the fixes you want.
/private/tmp/claude-501/-Users-iosif-Documents-Projects-better-tasks/53ae7dac-9013-42a3-a974-c8490897e797/scratchpad/T-065-prompt-audit.md
Is everything OK?
- 2026-10-06: User chose to apply all 11 fixes from the audit report.
- 2026-10-06: Prompt audit: no dated prompting style; 11 fixes applied where instructions no longer matched the flow (done line, project_init files, video lines gated on the setting, lead naming, logFile, tool descriptions)
