# supermanager

**Plan and track tasks inside Claude Code, kept as plain Markdown files in your project.**

## 📦 Install

```sh
claude plugin marketplace add iosifnicolae2/supermanager
claude plugin install supermanager@supermanager
```

Restart Claude Code.

<p align="center">
  <img src="docs/screenshots/board.svg" alt="Claude Code with the Sprint board docked on the right">
</p>

## ✨ Use

- **"create a task to fix the login redirect"**: asks which sprint (start now, this sprint, next sprint, backlog), saves it as Markdown in `.claude/manager/tasks/`.
- **`/supermanager`**: the sprint board. Weekly sprints with a goal; open tasks roll over.
- **"start T-001"**: a teammate takes the task; the board shows what it's doing.
- **`/supermanager config`**: settings.
- **`/away`**: screens off, the Mac keeps working.

## ⌨️ Board keys

Click the board or press `ctrl+x tab` first.

| key | does |
| --- | --- |
| `↑` `↓` | select |
| `enter` | actions: `←` `→` choose, `enter` runs |
| `o` · `s` · `d` | open · start · mark as done |
| `m` | move: `↑` `↓`, then `enter` |
| `b` | backlog ↔ this sprint |
| `c` | settings |

## 🔄 Update / uninstall

- **Update:** `claude plugin marketplace update supermanager && claude plugin update supermanager@supermanager`, then restart.
- **Uninstall:** `claude plugin uninstall supermanager@supermanager && claude plugin marketplace remove supermanager`.

## 🧩 Customize per project

Ask "set up supermanager for this project". Then edit `.claude/manager/config.json` (task ids, paths, settings) and the `.md` files beside it (task template, teammate and manager instructions).

## 🛠️ Development

`claude --plugin-dir .` runs this copy; `claude plugin test .` runs the tests.
