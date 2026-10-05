---
id: T-031
title: Open each PR in the browser when asking for approval (setting, on by default); one approval question at a time
sprint: 2026-10-05
urgent: false
status: done
owner: approvals
rolled: 0
order: -12
created: 2026-10-05
---
## Goal
User's words: "also, add an otpion in config to open each pr in the default browser, by default yes.. also make sure to ask only one task approval at a time so you can open a single pr, then ask the question and so on.."

Goal:
- New setting (on the config page, in the settings skill; default yes): when the lead asks the user to approve a finished task that has a PR, it first opens that PR in the default browser (macOS `open <url>`, Linux `xdg-open`, Windows `start`), then asks.
- Lead rules (Finishing): one task approval per AskUserQuestion, never several at once. With several finished tasks: open PR 1, ask about it, act on the answer; then open PR 2, ask, and so on. (Today the rules allow up to 4 questions per call; change that for approvals. Other questions are unaffected.)
- Setting off: no browser, still one approval at a time.

Done: the setting works both ways; a lead with two finished tasks opens and asks them one by one; explain how to check.

## Notes
- 2026-10-05: User, when the lead opened PR #13 for approval: "make sure to open the link after the video is uplaoded and also wait a few seconds so that it's loaded..". So: open the PR only once its video and picture are uploaded and show in the PR body (check the body has the attachment links, and they answer), then wait a few seconds after `open` before asking, so the page has loaded.
- 2026-10-05: Automated security review flagged bin/open-pr.sh (MEDIUM): loads() sends the user's gh token (Authorization header) to every image/video link found in the PR body, so a link to a non-GitHub host (jsDelivr from T-019's video branch, a project's own template, anything a PR body contains) would receive the token. Fix: attach the token only for GitHub-owned hosts (https://github.com/*, user-images.githubusercontent.com, private-user-images.githubusercontent.com), never use --location-trusted; add a test.
- 2026-10-05 (approvals): done, both notes above handled.
  - What changed: lead's Finishing rule (hooks/texts.ts): one finished task per AskUserQuestion; several finished: first, act on its answer, then the next. New setting `openPrInBrowser` (default true; /config "Open PRs in the browser", settings page row, settings skill). On + a PR flow: the lead's PR rules (hooks/pullrequest.ts `openPrLine`, also taken by the dev-prs flow) say to run `bin/open-pr.sh <url>` right before the question. open-pr.sh: "not ready" (exit 2, nothing opened) while the body links local files or the picture/video don't load (retries ~30 s, checked with the gh token, sent only to GitHub hosts); else opens the PR (open / xdg-open / start) and waits 5 s.
  - How to test: `claude plugin test .` (285 pass; new: prompt with setting on/off, dev flow, one-at-a-time rule); `sh scripts/open-pr-check.sh` (ok); `bun scripts/settings-doc.ts --check`. Ran open-pr.sh with a stub `open` on PR #13 and #14 (opened), a body with local paths and one with a broken video link (not ready).
  - Commits: db77c55, 1b45e24, 76b605d, 19071df, f52bd40. 76b605d also deletes .js files a `tsc` run had emitted into db77c55.
  - Not verified: a live lead session with two finished tasks (asks one by one, opens each PR). Windows `start` path untested. `tsc -p .` fails in this worktree (missing .claude-plugin/types, environment), not from this change.
  - Fresh GitHub uploads answer only to signed-in users at first (a 404 without a token), hence the gh token check.

### For the user
Links:
[PR #14](https://github.com/iosifnicolae2/better-tasks/pull/14)
Question:
T-031 Open each PR in the browser, one approval at a time
What changed: when tasks finish, I ask about one at a time. Before each question I open its PR in your browser, once its video is uploaded, and wait a few seconds for the page to load. A new setting, "Open PRs in the browser" (on by default), turns the opening off.
To test: open the PR below and watch the video. When the next tasks finish, check that each PR opens with its video, and then comes its own question.
https://github.com/iosifnicolae2/better-tasks/pull/14
Is everything OK?
- 2026-10-05: Video: [T-031.mp4](../tasks_videos/T-031.mp4) · PR: https://github.com/iosifnicolae2/better-tasks/pull/14 (approvals: the shared task file is outside my worktree, so these two lines come as a note. Please move them to the top of Notes. My done notes and "For the user" block were appended with a bash heredoc before the isolation refused a direct edit. They are at the end of Notes.)
- 2026-10-05: One approval per question; "Open PRs in the browser" setting (on by default) opens each PR via bin/open-pr.sh once its video loads, then waits 5 s; gh token sent only to GitHub hosts.
