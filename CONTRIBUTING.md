# Contributing to better-tasks
How to change, test and release this plugin. Open it before working on better-tasks itself.

## Change it through Claude
Ask Claude for the change. It forks this repo, makes the change there, runs the fork as a linked install (an edit applies on `/reload-plugins`, no reinstall), then asks whether to open a PR here: Yes, Not now or Never (kept per user in `~/.claude/better-tasks/user.json`).

## Run and check
- `claude --plugin-dir .`: runs this copy.
- `claude plugin test .`: runs the tests.
- `bun scripts/yaml-check.ts [tasks folder]`: checks task front matter with real YAML parsers (Ruby's Psych, as GitHub uses, and Bun.YAML).
- `sh scripts/video-branch-check.sh`: checks the video links `bin/video-branch.sh` prints.
- `sh scripts/open-pr-check.sh`: checks `bin/open-pr.sh` sends the gh token only to GitHub.
- `sh scripts/record-display-check.sh` (macOS): checks `bin/record-display.sh`: own display per project, one recording at a time, a killed recording frees its turn, the chosen test screen and its fallback.
- `bun scripts/settings-doc.ts`: regenerates the settings skill after a setting changes (`--check` says whether it is current).
- `bun scripts/skills-check.ts`: checks the skills still say what the prompts rely on.

Tools: `ffmpeg` and `uv` for videos, `gh` for pull requests, `python3` for the shared-dev-branch flow.

## Skills
Loaded only when their step comes, from [skills/](skills/): teammates load `testing` before they run the app, `video` before a change that shows on screen, `pull-request` to open the PR, `done` to report; the lead loads `contribute` for a change to better-tasks itself. The prompts keep a one-line pointer to each; a loaded skill gets the settings in force under its title.

## Releases
See [CLAUDE.md](CLAUDE.md): `scripts/release.sh v<next>` after changes reach main; installs get releases, not main.
