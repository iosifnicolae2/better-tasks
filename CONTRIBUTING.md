# Contributing to better-tasks
How to change, test and release this plugin. Open it before working on better-tasks itself.

## Change it through Claude
Ask Claude for the change. It forks this repo, makes the change there, runs the fork as a linked install (an edit applies on `/reload-plugins`, no reinstall), then asks whether to open a PR here: Yes, Not now or Never (kept per user in `~/.claude/better-tasks/user.json`).

## Run and check
- `claude --plugin-dir .`: runs this copy.
- `sh scripts/test.sh`: runs the tests. It first writes the rules in .claude/better-tasks/ as code into tests/templates.gen.ts (git-ignored), since the test runner can't read files; then `claude plugin test .`.
- `bun scripts/yaml-check.ts [tasks folder]`: checks task front matter with real YAML parsers (Ruby's Psych, as GitHub uses, and Bun.YAML).
- `sh scripts/video-branch-check.sh`: checks the video links `bin/video-branch.sh` prints.
- `sh scripts/task-pr-check.sh`: checks `bin/task_pr.py` on a scratch repo with a stand-in gh: the draft PR with its video before the approval, a new video in place of the old, `--ready`, straight to main's review PR and `close`, similar tasks in one PR with one video.
- `sh scripts/release-video-check.sh`: checks `bin/release_video.py`'s tasks and cards without making a video: a shared PR's tasks, their one video, one card for them.
- `sh scripts/open-pr-check.sh`: checks `bin/open-pr.sh` sends the gh token only to GitHub.
- `sh scripts/record-display-check.sh` (macOS): checks `bin/record-display.sh`: own display per project, one recording at a time, a killed recording frees its turn, the chosen test screen and its fallback.
- `bun scripts/settings-doc.ts`: regenerates the settings skill after a setting changes (`--check` says whether it is current).
- `bun scripts/skills-check.ts`: checks each skill has its front matter and its template.
- `bun scripts/instructions-doc.ts`: renders every instruction text better-tasks loads, as the model gets it, into one Markdown file from the current sources and prints its path (`--open` opens it).

Tools: `ffmpeg` and `uv` for videos, `gh` for pull requests, `python3` for the shared-dev-branch flow.

## Instructions
Every text the model reads is a template in [.claude/better-tasks/](.claude/better-tasks/), one file per kind: `lead.md`, `teammate.md`, `status-check.md`, and one per skill. `{% if gitFlow == "direct" %} … {% endif %}` and `{{ devBranch }}` follow the settings (hooks/template.ts); the hooks only render and send them. A project extends one with a file of the same name in its own `.claude/better-tasks/`, or replaces it (`replace: true` in its front matter); `@/<file>` pulls in the shipped one.
Skills load only when their step comes: [skills/](skills/)<name>/SKILL.md holds the name and description; the template is its text.

## Releases
See [CLAUDE.md](CLAUDE.md): `scripts/release.sh v<next>` after changes reach main; installs get releases, not main.
