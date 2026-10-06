---
id: T-070
title: Submit better-tasks in the plugin directory portal (Chrome)
sprint: 2026-10-05
urgent: false
status: todo
owner: directory-2
rolled: 0
order: 1
created: 2026-10-06
---
## Goal
User's words: "ok, so open chrome and submit the plugin". This is the user's go-ahead to submit better-tasks to the Anthropic plugin directory, using the user's own Chrome (claude-in-chrome tools) on their screen. The user said to use it.

How:
- Open claude.ai/directory/manage in a new tab in the user's Chrome. Choose "Plugin bundle" and the repo iosifnicolae2/better-tasks, tracking release v0.11.11 if the form asks for a ref.
- Fill every field from /Users/iosif/Documents/Projects/better-tasks/.claude/tasks/T-067/submission.md, which T-067 prepared. The user accepted it as-is, including the open findings listed there (no `version` in plugin.json, narrated videos, and the rest).
- The user asked for the submission, so tick the acknowledgements and submit. Before ticking, copy the exact wording of each acknowledgement into the task notes.
- Stop and report instead of guessing if any of these come up: a login, a missing paid plan, GitHub not connected, a payment, a field submission.md does not cover, or a validation or security-scan error. Don't change the repo to get past an error; report it.
- Avoid browser dialogs (alert/confirm). Don't edit anything else in the account.
- No PR or video needed. Report the submission's confirmation or status (a screenshot or its URL) and what the portal says happens next.

## Notes
- 2026-10-06: 2026-10-06: Blocked before opening anything. claude-in-chrome says "Browser extension is not connected"; list_connected_browsers returns no browsers. Nothing submitted, nothing changed in the account. Needs the user: open Chrome with the Claude extension, signed in to claude.ai as the same account as Claude Code (restart Chrome if newly installed), then tell me to retry.
- 2026-10-06: 2026-10-06: Chrome connected. Portal: Submit new > Plugin bundle > repo iosifnicolae2/better-tasks, tag v0.11.11 > Validate. Blocked: 12 blocking issues (10 invalid userConfig options in plugin.json, a config.set call at hooks/pane.tsx:147, a permission-hook check at hooks/register.tsx:260), 9 warnings, 15 policy holds. Next stays disabled. Stopped as the task says; repo unchanged, nothing submitted, draft saved in the portal tab. Details: .claude/tasks/T-070/validation.md, screenshot .claude/tasks/T-070/validation-blocked.jpg. Note: the icon is set only on the first save/submit and can't change later.
- 2026-10-06: User: "yes, then i approve things", which is a go-ahead for the plan: re-validate task/T-071 in the portal, release v0.11.12 if there are 0 blocking issues, then submit. The user approves at the end.
- 2026-10-06: 2026-10-06: Re-validated in the saved draft against task/T-071 @ f8af5ba: 1 blocking, 9 warnings, 18 policy holds, 5 of 7 checks passed. Not submitted. Blocking: hooks/pane.tsx:152 "Mod may write the default permission mode in a way the directory couldn't read". That's the config.set calls in writeOption($, field, value), a helper that gets $ passed in. The portal wants the call on the hook's own first parameter, and says a mod that keeps a copy of its engine can't make a settings call. New warning: no version in plugin.json. The icon is now accepted (passed as a well-formed image). The draft also tracks task/T-071 now; it moves to the release tag later.
- 2026-10-06: 2026-10-06: Re-validated task/T-071 @ 53d804a: still 1 blocking, 9 warnings, 18 policy holds. Not submitted. Blocker moved to hooks/pane.tsx:421, the first config.set in the ui.press hook (case 'editor'). Finding detail, code MOD_CONFIG_SET_UNREAD: "the argument is not one object written in the call with plain key and value members, or the key is not fixed text". The keys are fixed text, so the shorthand `value` member is the likely cause; try `value: value`.
- 2026-10-06: 2026-10-06: Re-validated task/T-071 @ c1cd830: "Validation passed: 9 warnings, 18 policy holds", 0 blocking. Not submitted; waiting for the v0.11.12 tag, then switch the draft's branch/tag to it, re-validate and submit.
- 2026-10-06: 2026-10-06: v0.11.12 @ ed9acc1 validated: passed, 0 blocking, 9 warnings, 20 policy holds (the image-file hold is now 6 findings, was 4; 238 files). Listing details: listed on Claude Code only; Cowork and Claude apps "Not available: Plugins with a top-level bin/ directory can't be installed here." Data handling answers: personal data No; "Does any skill send data to a service other than the declared connectors?" Yes, listed in README (submission.md's "No" was to *undisclosed* services; the README lists GitHub/Homebrew/PyPI/Hugging Face); retention Not retained; under 18 No. Compliance: contact email prefilled iosif@bringes.io. Acknowledgements, exact wording, NOT ticked:
1. "I have read and agree to the Software Directory Terms and the Directory Policy on behalf of iosif@bringes.io's Organization."
2. "The plugin's privacy policy accurately describes the data it handles."
3. "The plugin does not exfiltrate credentials or execute code outside its declared MCP servers."
4. "Anthropic may contact iosif@bringes.io about this submission and future policy changes."
Portal note: the submission will be held for policy review (it lists the 13 hold kinds); you can still submit. Stopped before ticking: #3 looks untrue as worded (no MCP servers are declared, yet hooks and bin/ scripts run programs: git, gh, brew, uv, ffmpeg, kokoro), and the scan found "Uses a credential from the user's machine" (3). Accepting terms needs the user's own yes.
- 2026-10-06: The user chose "Skip" on ticking the four acknowledgements and submitting. The draft stays saved, unsubmitted, in the portal at Step 4 (v0.11.12, 0 blocking). Paused until the user picks it up again.
- 2026-10-06: Moved out of "currently working on": paused by the user (they skipped submitting). It stays open.
