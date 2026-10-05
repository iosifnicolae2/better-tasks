# better-tasks

**A better way to manage tasks in Claude Code.**

<p align="center">
  <img src="docs/screenshots/board.svg" alt="Claude Code with the sprint board docked on the right">
</p>

A Claude Code plugin. Your tasks are Markdown files in your project; a team of Claude agents works on them; you only review the result. Above: you ask for a fix, the lead files it as T-007 and hands it to the teammate that owns the shop.

## ✨ Features

- 📝 **Tasks as Markdown**: plain files in `.claude/tasks/`, committed with your code.
- 🤖 **A team of agents**: a lead routes each task to a teammate; teammates work in parallel.
- 🎥 **Before/after video**: after each task you get a short narrated video, [like the one below](#-watch-the-fix-then-approve-it), to review it. Turn it on with the `demoVideos` setting.
- ✅ **You approve**: no task closes without your yes.
- 🔀 **Your git flow**: straight to main, a shared `dev` branch, or a worktree and PR per task. Asked once per project.
- 🗂️ **Sprint board**: `/better-tasks` shows sprints, goals, the backlog and search.
- 🌙 **`/away`**: screens off, the Mac keeps working.

## 📦 Install

```sh
claude plugin marketplace add iosifnicolae2/better-tasks
claude plugin install better-tasks@better-tasks
```

Restart Claude Code. Optional tools: `brew install ffmpeg uv` for videos, `gh` for pull requests.

<details>
<summary>Install for one project only</summary>

Run inside the project folder:

```sh
claude plugin marketplace add iosifnicolae2/better-tasks --scope project
claude plugin install better-tasks@better-tasks --scope project
```

This is saved in `.claude/settings.json`: commit it. Each teammate still runs the install once. `--scope local` is only you, only this project (not committed).
</details>

## 🎬 Watch the fix, then approve it

You watch a short video instead of reading the code first. Here is the one for T-007 above:

[![Play the before/after demo video](docs/videos/sample-before-after.png)](https://cdn.jsdelivr.net/gh/iosifnicolae2/better-tasks@main/docs/videos/sample-before-after.mp4)

<sub>Click to play, with sound: the subtitles are read aloud.</sub>

Then you answer one question:

| You pick | What happens |
|---|---|
| **Mark as resolved** | The task closes. |
| **Request changes** | Type what to change. The same teammate fixes it and sends it back to you. |

Claude asks about one task at a time. With a PR per task, it opens the PR in your browser first (setting `openPrInBrowser`).

## ⚙️ Settings

`/better-tasks config` (or `c` on the board), Claude Code's `/config`, or per project in `.claude/tasks/config.json`.
Git flow, teammate models, videos, your PR template, your own instructions for every task, and more. Every setting, its choices and default: [skills/settings/SKILL.md](skills/settings/SKILL.md). Or just ask Claude what you can configure.

Project rules for every task: ask *"set up better-tasks for this project"*, then edit the files in `.claude/tasks/`.

## 🔄 Update / uninstall

```sh
claude plugin marketplace update better-tasks
claude plugin update better-tasks@better-tasks
```

Restart Claude Code. Updates bring the latest [release](https://github.com/iosifnicolae2/better-tasks/releases), not every commit on main.

<details>
<summary>Uninstall</summary>

```sh
claude plugin uninstall better-tasks@better-tasks
claude plugin marketplace remove better-tasks
```

Installed per project? Add `--scope project` to `update` and `uninstall`.
</details>

## 🛠️ Contributing

Ask Claude for the change: it forks this repo, tries it as a linked install, then offers to open a PR here. Details and dev commands: [CONTRIBUTING.md](CONTRIBUTING.md).
