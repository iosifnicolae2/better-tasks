---
id: T-013
title: Update gh automatically on machines where it's too old for PR videos
sprint: 2026-09-28
urgent: false
status: done
owner: demo-videos
rolled: 0
order: -1
created: 2026-10-04
---
## Goal
User's words, after resolving T-012 (PR per task): "make sure to also update on the other clients if it's not working". Context: video upload in PRs needs gh 2.99+ (`gh pr create --attach`). T-012 only shows a toast when gh is missing or too old. On this Mac the user had to upgrade by hand (now 2.102).

What this means: when "PR per task" is on (at startup or when it's turned on) and gh is missing or older than 2.99, the plugin updates it itself, the same way the Kokoro voice setup installs itself: `brew upgrade gh` / `brew install gh` on macOS, and a sensible route or a clear one-line instruction elsewhere. Toast when it starts and when it's done or fails. If it can't update, PRs still work without the video, as now.

Done looks like: on a machine with an old gh, turning the setting on brings gh to 2.99+ without the user typing anything; tests cover the version check → update path.

## Notes
- 2026-10-04: demo-videos: done, waiting for the user's review. Commit 607beef.

What changed:
- New script bin/gh-update.sh. With Homebrew it runs `brew upgrade gh` (or `brew install gh` when gh is missing), then reports the new version and whether gh is signed in.
- The plugin runs it by itself when "PR per task" is on and gh is missing or older than 2.99: at startup, and when the setting is turned on (settings page or /config). This is the same pattern as the Kokoro voice setup. Toasts say "Updating the GitHub CLI…" when it starts, then "GitHub CLI updated (2.102.0): PRs carry their video."
- It re-checks the version the update reports, so if another, older gh comes first on PATH it says so and doesn't claim success. If gh was newly installed but isn't signed in: "Sign in once: gh auth login" (signing in needs the user).
- Without Homebrew (Linux, or a Mac without brew), or when brew fails: one line says to update by hand (https://github.com/cli/cli#installation, plus the log path). PRs keep working without the video, as before.
- README and the setting's description now say gh updates itself.

To test: on a Mac with an old gh (or no gh), turn on "PR per task" in /better-tasks config. A toast says gh is updating, then that it's done, and `gh --version` shows 2.99 or newer. On this Mac (gh 2.102 already) nothing happens.

Checks: 189 pass, 0 fail (new: the update verdict, and startup with old/missing gh → update runs → done toast); tsc clean. I ran the script for real on this Mac: "ready gh version 2.102.0", a brew no-op.

Not verified: a real `brew upgrade` from an old gh. This Mac is already current and I didn't downgrade it. Linux: no automatic update (apt/dnf need sudo); it gives the one-line instruction instead.
- 2026-10-04: User review (request changes): "ask also the user to turn on automatic pr". So: at startup, ask about "PR per task" the same way the "Before/after videos" question is asked (T-011): once, on the first interactive start, recommending "Enable", and asked again if dismissed. Turning it on goes through the same path as /better-tasks config, including this task's gh update. Asking both questions in one dialog is fine if that's how the startup question works; don't ask about PRs in a project without a GitHub remote, or say why if you do.
- 2026-10-04: demo-videos: PR per task is now asked at startup. Commit 900af70.
- On the first interactive start, after the videos question, a second question asks: "Open a GitHub pull request for each finished task? …", with "Enable (recommended)" or "Not now". The dialog takes one question per call, so they come one after the other, not in one dialog.
- Asked once per machine. If it's dismissed, it's asked again next session. Enable turns the setting on the same way /better-tasks config does, including the gh update from this task. If the setting is already on, startup only checks/updates gh.
- Only in a project with a GitHub remote (`git remote -v` names github.com, ssh or https). Elsewhere it isn't asked, and it isn't marked as asked either, so the first GitHub project asks it. If the setting is on in a project without GitHub, teammates commit as usual and say so (new line in their PR rules).
- To test: start Claude Code in this repo. If the videos question was answered before, only the PR question appears; Enable turns "PR per task" on in /better-tasks config.
- Checks: 193 pass, 0 fail (new: both questions in order with both set up; no GitHub remote → not asked, then asked in a GitHub project; GitHub remote detection). tsc clean.
- Not verified: the two dialogs back to back in a live session.
- 2026-10-04: Resolved by the user. With "PR per task" on, gh is updated by itself via Homebrew when missing or older than 2.99 (toasts; a one-line manual hint otherwise). Startup asks about "PR per task" after the videos question, only in GitHub projects.
