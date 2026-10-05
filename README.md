# better-tasks

**Plan and track tasks inside Claude Code, kept as plain Markdown files in your project.**

<p align="center">
  <img src="docs/screenshots/board.svg" alt="Claude Code with the Sprint board docked on the right">
</p>

## 📦 Install

**For you, in every project** (default, recommended):

```sh
claude plugin marketplace add iosifnicolae2/better-tasks
claude plugin install better-tasks@better-tasks
```

**For one project only**, run inside the project folder:

```sh
claude plugin marketplace add iosifnicolae2/better-tasks --scope project
claude plugin install better-tasks@better-tasks --scope project
```

- Project scope: saved in `.claude/settings.json`; commit it. Each teammate still runs the install once.
- `--scope local`: only you, only this project (`.claude/settings.local.json`, not committed).

Restart Claude Code.

## ✨ Features

- 📝 **Tasks as Markdown** in your project, committed with your code.
- 🗂️ **Sprint board** (`/better-tasks`): sprints with a goal, backlog, search.
- 🤖 **A team of agents:** the lead hands each task to a teammate.
- ✅ **You approve** finished work before a task closes.
- 🎥 **Before/after videos** of each change, narrated.
- 🔀 **A pull request per task**, merged when you approve.
- 🌙 **`/away`:** screens off, the Mac keeps working.

### 🎬 Demo: a before/after video

A video better-tasks made of its own change: the settings page before and after the "Before/after videos" row. Turn the sound on: the subtitles are read aloud.

[![Before/after demo video: click to open it](docs/videos/before-after-poster.png)](docs/videos/before-after.mp4)

## 🔄 Update / uninstall

**Update:**

```sh
claude plugin marketplace update better-tasks
claude plugin update better-tasks@better-tasks
```

Then restart Claude Code. Updates bring the latest [release](https://github.com/iosifnicolae2/better-tasks/releases), not every commit on main; `claude plugin list` shows the installed version.

**Uninstall:**

```sh
claude plugin uninstall better-tasks@better-tasks
claude plugin marketplace remove better-tasks
```

Installed per project? Add the same `--scope project` to `update` and `uninstall`.

## 🧩 More

- **Settings:** `/better-tasks config` (or `c` on the board), Claude Code's `/config`, or per project in `.claude/tasks/config.json`.
- **Optional tools:** before/after videos need `ffmpeg` and `uv` (`brew install ffmpeg uv`); pull requests need `gh`.
- **Project setup:** ask "set up better-tasks for this project", then edit the files in `.claude/tasks/`.
- **Development:** `claude --plugin-dir .` runs this copy; `claude plugin test .` runs the tests; `bun scripts/yaml-check.ts [tasks folder]` checks task front matter with real YAML parsers (Ruby's Psych, as GitHub uses, and Bun.YAML).
