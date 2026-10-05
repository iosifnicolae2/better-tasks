---
id: T-018
title: Stop IntelliJ re-indexing when teammate worktrees are created or merged
sprint: 2026-10-05
urgent: false
status: done
owner: worktrees
rolled: 0
order: 0
created: 2026-10-05
---
## Goal
User's words: "when a worktree is merged or i don't know.. intellij is starting to do a lot of load by analyzing the project.. that's not good.. figure out a smart solution on how to fix this when you do your worktrees.."

Problem: teammates work in git worktrees. When a worktree is created, merged or removed, IntelliJ (open on the main project) starts heavy indexing/analysis. Likely causes to check: worktrees living inside the project folder (e.g. .claude/worktrees/) so IntelliJ sees them as project content and indexes whole copies of the repo; big file churn on merge/pull.

Goal: find the real cause, then fix it in how better-tasks makes worktrees, so the user's IDE stays quiet. Ideas to weigh (pick the smartest, not all): put worktrees outside the project folder; or mark the worktree folder as excluded for IntelliJ (e.g. .idea excludeFolder, or a marker IntelliJ honors) automatically; keep it working for any user's project, not only this one.

Done: worktrees no longer trigger IntelliJ indexing of their contents; explain in plain words what was the cause and what changed; how the user can check it.

## Notes
Video: [T-018.mp4](../tasks_videos/T-018.mp4)
- 2026-10-05: User: "make sure to ignore it from being analysed by intellij.. (on startup do it..)". So the plugin must mark the worktree folder as excluded for IntelliJ automatically at startup (session start), not rely only on moving the folder.
- 2026-10-05 (worktrees): Cause, from IntelliJ's own log (~/Library/Logs/JetBrains/IntelliJIdea2026.2/idea.log): Claude Code puts every teammate worktree (a full copy of the repo) in <project>/.claude/worktrees/. IntelliJ sees it as part of the project: it adds each copy's package.json/node_modules to its project model and re-scans. church-hub 15:28: "Started scanning for indexing... Reason: Changes from WorkspaceFileIndex", 12,764 files to index; better-tasks 16:01: 15,073 files to update, as worktrees came and went (incl. Claude Code's .trash-agent-* folders on removal).
- 2026-10-05 (worktrees): Fix (5f77fff, was e5ad7e0 before rebase; hooks/intellij.ts + session.start in register.tsx): at every session start the plugin marks .claude/worktrees as Excluded in the project's IntelliJ module (`<excludeFolder url="file://$MODULE_DIR$/.claude/worktrees" />`). Project with .idea/modules.xml: adds the line to the module whose root is the project. Plain folder project (no modules.xml; IntelliJ keeps its module only in its cache, like better-tasks): writes .idea/<folder>.iml + modules.xml, as IntelliJ itself does once you change a module. Left alone: no .idea/, Gradle/Maven/sbt projects (their modules aren't in .idea files). Logs one line when it changed something. README feature line: 3f2a91c.
- 2026-10-05 (worktrees): Not done, on purpose: moving worktrees out of the project. Claude Code's WorktreeCreate hook can do it, but it replaces Claude Code's whole worktree handling (.worktreeinclude copies, symlinkDirectories, the "unchanged → remove" check, the stale-worktree sweep); a hook-made worktree is never swept, and WorktreeRemove fires when a subagent ends, so a bug there could delete a teammate's work. Exclusion keeps Claude Code's worktrees exactly as they are, and the PR flow unchanged.
- 2026-10-05: User skipped reopening better-tasks in IntelliJ for now. User approved adding the worktrees exclusion to church-hub/.idea/church-hub.iml now.
- 2026-10-05: Coordination: the best-remote-desktop session's teammate "better-tasks-plugin" is about to change this plugin (git-workflow setting that folds in "PR per task" and "worktree per teammate", plus a custom task-instructions setting; spec /Users/iosif/Documents/Projects/best-remote-desktop/.claude/tasks/T-024-better-tasks-choose-the-git-workflow-at.md). Agree with it on files; it builds on T-018's commits on main.
- 2026-10-05 (worktrees): Done. PR: https://github.com/iosifnicolae2/better-tasks/pull/2 (branch task/T-018; commits 5f77fff, 3f2a91c, rebased on cce57e2). Tests: 221 pass, tsc clean.
  - Checked live: church-hub (module file existed): wrote the exclude at 17:22:01; IntelliJ reloaded it at 17:22:19 with no restart: "Removed .claude/worktrees/.../node_modules: under excluded roots" and removed every worktree package.json from its project model.
  - better-tasks (plain folder project): .idea/better-tasks.iml + modules.xml are written, but an open IntelliJ does not pick up a new modules.xml; it takes effect when the project is next opened. Not verified yet (user skipped the reopen).
  - How the user checks: in IntelliJ's Project view, .claude/worktrees is shown as excluded (orange folder); right-click it: "Mark Directory as > Cancel Exclusion" is offered. Or open .idea/<project>.iml and look for the excludeFolder line. Starting or ending a teammate no longer shows "Indexing..." for its copy.
  - Not covered: Gradle/Maven/sbt projects (modules not in .idea files; exclude it in IntelliJ by hand once, or in the build file); IntelliJ opened on a parent folder of the repo.
  - The plugin applies this only from the next release; until then, other projects get it at their first session start after updating.
- 2026-10-05: At every session start the plugin marks .claude/worktrees as Excluded in the project's IntelliJ module, so IntelliJ stops indexing teammate copies (checked live on church-hub).
