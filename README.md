# better-tasks

**A better way to manage tasks in Claude Code.**

<p align="center">
  <img src="docs/screenshots/board.svg" alt="Claude Code with the sprint board docked on the right">
</p>

A Claude Code plugin. Your tasks are Markdown files in your project; a team of Claude agents works on them; you only review the result. Above: you ask for a fix, the lead files it as T-007 and hands it to the teammate that owns the shop.

## ✨ Features

- 📝 **Tasks as Markdown**: plain files in `.claude/tasks/`, committed with your code. Labels group related tasks; a task can wait on other tasks, or on every task with a label (`dependsOn`), and the lead starts it once they are done.
- 🤖 **A team of agents**: a lead routes each task to a teammate; teammates work in parallel.
- 🎥 **Before/after video**: after each task you get a short narrated video to review it ([see an example](https://cdn.jsdelivr.net/gh/iosifnicolae2/better-tasks@main/docs/videos/sample-before-after.mp4)). Turn it on with the `demoVideos` setting. A release can come with one video of all its tasks' videos: `bin/release-video.sh` (setting `releaseVideos`).
- 👀 **Live review**: Gemini watches a teammate's test as it runs and flags anything off, each at its second in the recording, for the teammate to check. Your own Gemini key of a billed AI Studio project, kept in the Keychain; setting `liveReview`.
- ✅ **You approve**: no task closes without your yes.
- 🔀 **Your git flow**: a worktree and PR per task (the default), a shared `dev` branch, or straight to main. Asked once per project.
- 🗂️ **Sprint board**: `/better-tasks` shows sprints, goals, the backlog and search, grouped by label on `g`.
- 🌙 **`/away`**: screens off, the Mac keeps working; the virtual test displays stay on.

## 📦 Install

```sh
claude plugin marketplace add iosifnicolae2/better-tasks
claude plugin install better-tasks@better-tasks
```

Restart Claude Code. Optional tools: `brew install ffmpeg uv` for videos, `gh` for pull requests.

New release out? better-tasks asks at startup: *"better-tasks vX is out. Update?"* Yes updates it; restart Claude Code. No: not asked again for that release. Keep marketplace auto-update off: you pick each release.

<details>
<summary>Install for one project only</summary>

Run inside the project folder, `vX.Y.Z` being the [latest release](https://github.com/iosifnicolae2/better-tasks/releases):

```sh
claude plugin marketplace add iosifnicolae2/better-tasks#vX.Y.Z --scope project
claude plugin install better-tasks@better-tasks --scope project
```

This is saved in `.claude/settings.json`, pinned to that release (`"ref"`, no auto-update): commit it. Each teammate still runs the install once. Answering "everyone on this project" at setup does the same for you. A project set up unpinned or with `"autoUpdate": true` is pinned at its next start. `--scope local` is only you, only this project (not committed).
</details>

## ⚙️ Settings

`/better-tasks config` (or `c` on the board), Claude Code's `/config`, or per project in `.claude/tasks/config.json`.
Git flow, teammate models, videos, your PR template, and more. Every setting, its choices and default: [skills/settings/SKILL.md](skills/settings/SKILL.md). Or just ask Claude what you can configure.

Project rules for every task: ask *"set up better-tasks for this project"*, then edit the files it makes. To change what the lead or the teammates are told, put a file of the same name as one of [better-tasks' instructions](.claude/better-tasks/) in your project's `.claude/better-tasks/`: it is added after ours, or replaces it with `replace: true` at its top.

## 🔄 Update / uninstall

```sh
claude plugin marketplace update better-tasks
claude plugin update better-tasks@better-tasks
```

Restart Claude Code. Updates bring the latest [release](https://github.com/iosifnicolae2/better-tasks/releases), not every commit on main. In a project that pins better-tasks, saying Yes to the startup question also moves the pin.

<details>
<summary>Update fails: "its source doesn't match its extraKnownMarketplaces entry", or "already at the latest version"?</summary>

Your Claude Code settings pin better-tasks to an old release, and better-tasks before v0.11.8 can't move that pin. Fix it once, in the project folder:

```sh
curl -fsSL https://raw.githubusercontent.com/iosifnicolae2/better-tasks/main/bin/fix-update.sh | sh
```

It moves the pin to the latest release (a copy of your old settings: `~/.claude/settings.json.bak-better-tasks`), updates better-tasks and moves the project's pin: [bin/fix-update.sh](bin/fix-update.sh). Restart Claude Code. From then on, Yes to the startup question updates it.
</details>

<details>
<summary>Uninstall</summary>

```sh
claude plugin uninstall better-tasks@better-tasks
claude plugin marketplace remove better-tasks
```

Installed per project? Add `--scope project` to `update` and `uninstall`.
</details>

## 🔒 What it runs, reads and sends

better-tasks has no server and collects no data: nothing is sent to its author or to any analytics. It works through Claude Code's plugin hooks ([hooks/](hooks/)) and the scripts in [bin/](bin/), all in this repo.

- **Files it writes**: your tasks in `.claude/tasks/`, its settings in `.claude/tasks/config.json`, the finished-task log `docs/tasks.md`, sprint goals in `.claude/tasks/sprints.md` and before/after videos in `.claude/tasks_videos/`, all in your project. It also writes files other tools obey:
  - `.gitignore`: adds `.claude/worktrees/`, so teammates' worktrees stay out of git.
  - `.idea/`: marks `.claude/worktrees/` excluded in IntelliJ, only in a project that has `.idea/`.
  - `.claude/settings.json` (the project's): adds better-tasks, pinned to a release, when you answer "everyone on this project", and moves that pin when you say Yes to an update. It commits only that file.
  - `~/.claude/settings.json`: moves your pin of better-tasks to the new release when you say Yes to an update (back as it was if the update fails).
  - `~/.claude/CLAUDE.md` and `~/.claude/settings.json` through Claude, with your approval: see the prompts below.
- **Files it reads**: your project, Claude Code's settings (to pin and update the plugin), and a finished teammate's transcript in `~/.claude/projects/`, which only its successor is pointed at.
- **Settings and environment**: in this Claude Code process it sets `CLAUDE_CODE_PROMPT_CACHE_TTL` and `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL` to `1h` (setting `longCache`), unless you set a TTL yourself. Its settings page writes only its own `/config` rows (`better-tasks.*`) or the project's `.claude/tasks/config.json`. When you turn a setting on, it sets up what that setting needs (the Kokoro voice for videos, `gh` for pull requests).
- **Slash commands it runs**: `/config`, only when you press "All Claude Code settings" on its settings page. It adds `/better-tasks` and `/away`.
- **Prompts it submits, in your session**:
  - Once per machine: asks Claude to add a line to `~/.claude/CLAUDE.md` pointing at its team rules. You approve the edit.
  - When agent teams are off: asks Claude to add `"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"` to the `env` block of `~/.claude/settings.json` (you approve the edit) and then to ask you to restart.
  - After `statusEvery` quiet minutes (10 by default, 0 turns it off) while a task is running (status `doing`) and nothing is in your prompt box: a status check asking the lead to move the open tasks forward ([.claude/better-tasks/status-check.md](.claude/better-tasks/status-check.md)).
  - "Start" on a task of the board: a prompt to start that task.
- **What it adds to Claude's prompts**: its team rules in the system prompt, and beside each of your prompts a short block with the sprint, the open tasks and its reminders. Its skills read with the settings in force filled in. All the texts: [.claude/better-tasks/](.claude/better-tasks/); one page with each as Claude gets it: `bun scripts/instructions-doc.ts --open` in a clone.
- **Tool calls it changes or answers**: a named teammate's Agent call gets its task's title as the description, the teammate rules and its predecessor's transcript path added to the prompt, the agent type of its level, and a worktree when the git flow uses them. Its own tools (`mcp__better-tasks__*`) are answered by the plugin itself. It never answers a permission question: you do. Its teammate agent types run in `default` permission mode, so a teammate asks you as Claude Code would (a lead in bypass, accept-edits or auto mode gives its teammates that mode, as Claude Code does).
- **Programs it runs, on your machine**: `git`; `gh` for pull requests, with your own GitHub login; `claude plugin marketplace` and `claude plugin update` when you say Yes to an update; your editor or the default app (`open`), to open a task or a video; on macOS `caffeinate` (setting `keepAwake`), and for `/away` `pmset`, `osascript` and a small virtual-display helper compiled from [bin/](bin/). With videos on: `ffmpeg`, `uv` and the Kokoro voice ([bin/demo-video.sh](bin/demo-video.sh)). With live review on: `node`, `screencapture` and `security` ([bin/live-review.sh](bin/live-review.sh)).
- **Credentials**: none of its own, except the Gemini API key you give live review: kept in the macOS Keychain (service "better-tasks gemini"), never in a file, read only by [bin/live_review.mjs](bin/live_review.mjs) and sent only to Google's Gemini API. `gh` uses your GitHub login. Before it opens a PR for you to approve, [bin/open-pr.sh](bin/open-pr.sh) reads `gh auth token` to check that the PR's video loads, and sends it only to GitHub's own hosts.
- **Network**: `git ls-remote` on this GitHub repo at startup, to see if a release is out. With "PR per task", `gh` talks to GitHub for your repo, and better-tasks installs or updates `gh` with Homebrew if it is missing or too old. With before/after videos on, a one-time setup installs the Kokoro voice (`uv` fetches packages from PyPI and the voice model from Hugging Face) into `~/.local/share/better-tasks/kokoro`, and each video goes to its PR on GitHub (attached by `gh`, as when you drop a file in; it opens for whoever can see the repo; without `gh` 2.99+, on a `better-tasks-videos` branch of your repo). With live review on (setting `liveReview`, off by default), npm installs Google's `@google/genai` once into `~/.cache/better-tasks/`, and while a teammate tests, the test display's frames that changed (never your own screens; the boxes it masks blacked out) go to Google's Gemini Live API under your key, about $0.02 a minute. Use a key of an AI Studio project with billing on: on the free tier Google may use what is sent to improve its products, and people may review it (the Gemini API terms, "Unpaid Services"); on either tier Google keeps requests 55 days to detect abuse. Nothing else.

Questions, bugs or a security report: [open an issue](https://github.com/iosifnicolae2/better-tasks/issues) or write to iosif@bringes.io.

## 🛠️ Contributing

Ask Claude for the change: it forks this repo, tries it as a linked install, then offers to open a PR here. Details and dev commands: [CONTRIBUTING.md](CONTRIBUTING.md).
