---
id: T-050
title: "Security: argument injection in the update check's git ls-remote"
sprint: 2026-10-05
urgent: false
status: done
owner: plugin-pinning
rolled: 0
order: -2
created: 2026-10-06
---
## Goal
An automatic security review flagged hooks/updatecheck.ts after T-048 shipped in v0.11.0, rated HIGH:
- `lsRemoteArgv(url)` runs `git ls-remote --tags --refs <url>`. `url` comes from `repoUrl()` (hooks/teaminstall.ts:48), which reads the git source url from the project's shared .claude/settings.json. A cloned repo controls that file. A url like `--upload-pack=<cmd>` would make git run a command at session start (register.tsx:472).
- `repinArgv(source, tag)` passes `addSource(shared)` to `claude plugin marketplace add`. It has the same risk if the source starts with `-`.

Fix:
- In `repoUrl`, accept only a plain `https://...` git URL (no spaces, not starting with `-`), and use upstream `https://github.com/iosifnicolae2/better-tasks.git` otherwise. Accept only an `owner/repo` GitHub source for the marketplace source too.
- Add the end-of-options marker: `['git', 'ls-remote', '--tags', '--refs', '--', url]`.
- In `repinArgv`, reject a source that starts with `-` or isn't the accepted shape. Check every other place that passes settings-file values to a command the same way.
- Tests for the malicious values (`--upload-pack=touch /tmp/x`, `-c core.sshCommand=...`, `ext::sh -c ...`). Full tests pass.
- Small and fast: this is in a published release.

## Notes
- 2026-10-06: PR: https://github.com/iosifnicolae2/better-tasks/pull/31
- Video: none (nothing shows on screen).
- Changed (8ec3baa, from fc451cb / v0.11.0):
  - repoUrl uses the settings value only for a GitHub owner/repo or a plain https URL; anything else goes to upstream.
  - '--' is added before the positional argument of git ls-remote, claude plugin marketplace add and claude plugin update. Both claude forms were checked against the real CLI in a sandbox config.
  - repinArgv refuses any other source shape and any tag that isn't vX.Y.Z; the update then stops with one log line.
  - The install scope must be user, project, local or managed.
  - devBranch starting with '-' is refused, and git branch --list gets '--'.
- Checks: claude plugin test . 320 pass (new cases: --upload-pack, -c core.sshCommand, ext::, file://, spaces, -owner, bad tag, bad scope). tsc is clean; settings-doc --check and skills-check pass. By hand: `git ls-remote ... -- '--upload-pack=touch <file>'` fails with "strange pathname blocked" and no file is made.
- Note: forks on ssh:// or git@ URLs now use upstream for the release check.
- Follow-up (other area): bin/task_pr.py --dev gets the dev branch from the settings too.

### For the user
Links:
[PR #31](https://github.com/iosifnicolae2/better-tasks/pull/31)
Question:
T-050 Security fix in the startup update check
What changed: a project's settings file can no longer slip a command into the update check. better-tasks only accepts a normal GitHub or https address there; anything else is ignored.
To test: nothing to do by hand. The automatic tests try the attack strings from the security review and all of them are blocked.
https://github.com/iosifnicolae2/better-tasks/pull/31
Is everything OK?
- 2026-10-06: Update check: only owner/repo or plain https sources from settings; '--' before positional args of git ls-remote and claude plugin commands; tag, scope and devBranch validated. 320 tests pass.
