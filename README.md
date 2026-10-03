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

- **"create a task to fix the login redirect"**: asks which sprint, saves it as Markdown in `.claude/manager/tasks/`.
- **`/supermanager`**: the sprint board. Weekly sprints with a goal; open tasks roll over.
- **"start T-001"**: a teammate takes the task; the board shows what it's doing.
- **`/supermanager config`**: settings.
- **`/away`**: screens off, the Mac keeps working.

## 🔄 Update / uninstall

- **Update:** `claude plugin marketplace update supermanager && claude plugin update supermanager@supermanager`, then restart.
- **Uninstall:** `claude plugin uninstall supermanager@supermanager && claude plugin marketplace remove supermanager`.

## 🧩 More

- **Per project:** ask "set up supermanager for this project", then edit the files in `.claude/manager/`.
- **Development:** `claude --plugin-dir .` runs this copy; `claude plugin test .` runs the tests.
