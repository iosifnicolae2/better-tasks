# better-tasks: plugin directory submission (T-067)
Every field of the Anthropic directory submission, filled in, to read before it is sent. Open it before submitting, at claude.ai/directory/manage.

Nothing here has been sent. Sources, read 2026-10-06: [Submit a plugin](https://www.claude.com/docs/plugins/submit), [Plugin pre-submission checklist](https://www.claude.com/docs/plugins/pre-submission-checklist), [Publish a plugin](https://code.claude.com/docs/en/plugins/publish), [Software Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy), [Software Directory Terms](https://support.claude.com/en/articles/13145338-anthropic-software-directory-terms).

## How it is submitted
- **Where**: the developer portal, **claude.ai/directory/manage** (signed in as iosif@bringes.io). Pull requests to `anthropics/claude-plugins-official` are closed automatically for outside authors, and that official marketplace takes no portal submissions (it lists Anthropic's and partners' plugins). An approved plugin is listed in the directory on claude.ai, in Cowork and in Claude Code.
- **Needs**: a paid claude.ai plan (Pro or Max: your own account), your GitHub account connected to claude.ai, the repo public before it goes live.
- **Before**: `claude plugin validate .` in the repo (passes, see "Open findings").

## The form, step by step
1. **What would you like to submit?** Plugin bundle
2. **Source**
   - Repository: `iosifnicolae2/better-tasks`
   - Plugin path: (empty: `.claude-plugin/plugin.json` is at the repo root)
   - Branch or tag: `v0.11.11`, the next release, which carries this task's README and plugin.json changes. A tag stays on its commit, so after each release the field moves to the new tag (or see finding 1 for a branch that does it by itself). Not `main`: installs get releases, not main.
   - Then: Run validation checks.
3. **Listing details** (read from plugin.json and the README; change them there, not in the portal)
   - Name: `better-tasks`; display name: better-tasks
   - Description: Plan and track tasks inside Claude Code, kept as plain Markdown files in your project, with weekly sprints, a sprint board and agent teammates.
   - Author: Iosif Nicolae; license MIT; homepage and repository https://github.com/iosifnicolae2/better-tasks; keywords tasks, sprints, project-management, agent-teams, markdown
   - Long description: the README (picture: docs/screenshots/board.svg)
4. **Data handling**
   - Reads or stores personal data? **No.** It stores your tasks as Markdown files in your project and its settings in `.claude/tasks/config.json`; nothing leaves your machine except what git and gh send to your own GitHub.
   - Sends data to undisclosed services? **No.** Every destination is listed in the README, "What it runs, reads and sends": GitHub (git ls-remote for releases; with PR per task, gh for your repo), Homebrew (to install or update gh), PyPI and Hugging Face (one-time Kokoro voice setup, only with videos on).
   - Retains data, and how long? Only local files in your project and `~/.local/share/better-tasks/kokoro` (the voice), kept until you delete them. No server.
   - Targets users under 18? **No.**
5. **Compliance**
   - Contact email: iosif@bringes.io
   - The four acknowledgements: read and tick them yourself (they accept the Directory Terms and Policy in your name).
6. **Review and submit**
   - Updates: GitHub push webhook (the default). With a tag tracked, a push does not move it; the webhook just makes a new tag's check faster.
   - Submit for review.

## What the policy asks for, and where it is
- Privacy policy link: https://github.com/iosifnicolae2/better-tasks#-what-it-runs-reads-and-sends
- Support: https://github.com/iosifnicolae2/better-tasks/issues, or iosif@bringes.io
- Documentation: the README, and every setting in skills/settings/SKILL.md
- Test account: none needed (no service, no login).
- Three working prompts:
  1. "Set up better-tasks for this project." (makes `.claude/tasks/`, asks the git flow, files the project rules)
  2. "Add a task: the login page shows no error when the password is wrong. Urgent." (the lead files T-001 and hands it to a teammate)
  3. "/better-tasks" (the sprint board: this sprint's tasks, its goal, the backlog and search)

## Open findings: for you to decide before submitting
1. **No `version` in plugin.json.** The validator warns, and the checklist lists `version` as required; the submit page says only "if your plugin.json sets version, raise it with every release". The project rule keeps it out (it would win over the marketplace entry's version and freeze updates). Not added. If the portal blocks on it: release.sh could write `version` into plugin.json in each "Release v…" commit, so it always equals the tag. The same change could also move a `release` branch to each new tag, for the directory to follow instead of a tag edited by hand. That is a release.sh change, a task of its own.
2. **AI-generated audio.** The policy's prohibited uses include generating images, video or audio. The before/after videos (off by default, `demoVideos`) are narrated by a local text-to-speech voice (Kokoro). They are review aids for the user's own tasks, not content the plugin offers. A reviewer may still ask; the README says so plainly.
3. **A binary file**: `docs/videos/sample-before-after.mp4` (390 KiB, the README's example video). Binary files, and files over 256 KiB, are held for a reviewer, not blocked. To avoid the hold: move it to a GitHub release asset and link that from the README (the video area's call).
4. **Package installs in scripts**: `bin/kokoro-setup.sh` runs `uv pip install "kokoro>=0.9.4" "transformers>=4.40" soundfile pillow` (ranges, not exact versions) and `brew install espeak-ng`; `bin/gh-update.sh` runs `brew install/upgrade gh`. The checklist wants launchers and package installs out of hook scripts and exact versions; a scanner may hold or flag these. Pinning exact versions in kokoro-setup.sh is the video area's call.
5. **`CLAUDE.md` at the repo root** (the project's rules for working on better-tasks): `claude plugin validate --strict` warns that a plugin does not load it. Harmless; moving it to `.claude/CLAUDE.md` silences it, and Claude Code still reads it there.
6. **Claude Code only.** better-tasks is function hooks, a sprint board pane, agent teams and skills that drive git: on claude.ai and in Cowork little or none of it loads. The listing reaches all three; the README says "A Claude Code plugin" in its first line.
7. **Private macOS API**: `/away`'s virtual displays use CoreGraphics' private virtual-display API (bin/record_display.h). Readable source, compiled on the user's Mac; listed in the README.

## Before and after
- BEFORE: before-validate.txt (next to this file): passes with warnings, no `displayName`, no data disclosure in the README.
- AFTER: plugin.json has `displayName`, `homepage`, `repository`, `keywords`; the README has "What it runs, reads and sends" and a support line. `claude plugin validate .` still passes with the one `version` warning.
