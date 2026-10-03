# better-tasks

**Plan and track tasks inside Claude Code, kept as plain Markdown files in your project.**

<p align="center">
  <img src="docs/screenshots/board.svg" alt="Claude Code with the Sprint board docked on the right">
</p>

## 📦 Install

```sh
claude plugin marketplace add iosifnicolae2/better-tasks
claude plugin install better-tasks@better-tasks
```

Restart Claude Code.

## ✨ Use

- **"fix the login redirect"**: a task, saved as Markdown in `.claude/tasks/`, and a teammate starts on it now. Say "next sprint" or "backlog" to plan it instead.
- **`/better-tasks`**: the sprint board. Weekly sprints with a goal; open tasks roll over.
- **"start T-001"**: a teammate takes the task; the board shows what it's doing.
- **`/away`**: screens off, the Mac keeps working.

## 🔄 Update / uninstall

- **Update:** `claude plugin marketplace update better-tasks && claude plugin update better-tasks@better-tasks`, then restart.
- **Uninstall:** `claude plugin uninstall better-tasks@better-tasks && claude plugin marketplace remove better-tasks`.

## 🧩 More

- **Per project:** ask "set up better-tasks for this project", then edit the files in `.claude/tasks/`.
- **Development:** `claude --plugin-dir .` runs this copy; `claude plugin test .` runs the tests.
