---
id: T-067
title: Submit better-tasks to the Anthropic plugin directory
sprint: 2026-10-05
urgent: false
status: done
owner: directory
rolled: 0
order: -2
created: 2026-10-06
---
## Goal
User's words: "submit better-tasks to anthropic plugin directory".

What to do:
1. Find out how the official Anthropic plugin directory takes submissions today (current docs: the official marketplace / plugin directory, its submission form or repo, its requirements and review rules). Use Context7 / web docs, not memory.
2. Check better-tasks against those requirements (plugin.json and marketplace.json fields, README, license, description, icon/screenshots, security/permissions notes, anything the directory asks for). Fix what is missing in the repo, in small commits, as usual for this repo (no `version` in plugin.json; marketplace.json is only edited by scripts/release.sh).
3. Prepare the submission itself: every field the form or PR needs, filled in, in a file in the task folder (e.g. submission.md) so the user can read it before it goes out.
4. Do NOT send the submission yourself: it is outward-facing and publishes under the user's name. Report done with the prepared submission and the link to where it is submitted; the lead asks the user before anything is sent. If the submission is a PR to a public repo, open nothing upstream until the user says yes.

If repo changes ship, they reach users with the next release (scripts/release.sh, see CLAUDE.md).

## Notes
Video: [T-067.mp4](../tasks_videos/T-067.mp4)
- 2026-10-06: How it is submitted today: the developer portal claude.ai/directory/manage ("Plugin bundle", from the GitHub repo; paid claude.ai plan, GitHub connected). PRs to anthropics/claude-plugins-official are auto-closed for outside authors. The prepared submission, every field filled in, and the open findings: [T-067/submission.md](T-067/submission.md). Nothing sent.
- 2026-10-06: Commits: 634e8c4 plugin.json displayName, homepage, repository, keywords; 0cfcc01 README "What it runs, reads and sends" + support line (committed by hand through a private index, only my hunk: a peer's uncommitted git-flow line in README stays theirs; so the pre-commit secret scan did not run on it, a text-only change).
- 2026-10-06: Checks: `claude plugin validate .` passes before and after (T-067/before-validate.txt, after-validate.txt), one warning left: no `version` in plugin.json, kept out per the project rule (finding 1 in submission.md). Not checked: the portal's own validation and security scan (only the portal runs them).
- 2026-10-06: Not changed, other areas' call (submission.md "Open findings"): the README's sample .mp4 (binary, held for review), unpinned `uv pip install` in bin/kokoro-setup.sh, root CLAUDE.md warning under --strict, release.sh writing `version` / moving a release branch. The policy bans generating audio/video: the Kokoro-narrated videos may draw a question.
- PR: https://github.com/iosifnicolae2/better-tasks/pull/37
- 2026-10-06: Accepted. Full tests: claude plugin test . 320 pass, 0 fail; validate passes (version warning). Review PR #37 closed.
- The submission should track the tag of the next release (v0.11.11), which carries these commits.

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/37
T-067 Submit better-tasks to the Anthropic plugin directory
The submission is ready to read, not sent: every field of the claude.ai/directory/manage form, filled in (T-067/submission.md). plugin.json gained a display name, homepage and keywords; the README now says what better-tasks runs, reads and sends, and where to get support. Seven points for you to decide before it goes out are listed there; the main one is that plugin.json has no version.
- 2026-10-06: Directory submission prepared (T-067/submission.md), not sent: the user submits at claude.ai/directory/manage after v0.11.11. plugin.json gained displayName, homepage, repository, keywords; README gained "What it runs, reads and sends" and a support line. Tests 320 pass; review PR #37 closed.
