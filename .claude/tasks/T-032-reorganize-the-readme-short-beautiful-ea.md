---
id: T-032
title: "Reorganize the README: short, beautiful, easy for developers; lead with the key idea"
sprint: 2026-10-05
urgent: false
status: done
owner: readme
rolled: 0
order: 0
created: 2026-10-05
---
## Goal
User's words: "organize the readme. make it easier to read by developers, also the more contains too much info.. make it look beautiful, easy to understand, highlight the key things.. delegate task to claude, get a video before/after review video so that it's easier to approve or request changes"

Goal:
- The README opens with the key idea, in one line a developer gets at once: delegate tasks to Claude, get a before/after review video, approve or request changes. Show the demo picture/video (docs/videos/sample-before-after) right there.
- Then the few things a developer needs: what it does (key features as short highlights), install (one command), first use (a 3-step example), and how approval works.
- The "More" section has too much: cut it hard. Move details out to where they belong and link: settings → the better-tasks:settings skill (skills/settings/SKILL.md); release/contributing → CLAUDE.md / a short CONTRIBUTING section. Say a thing once.
- Looks good on GitHub: clear headings, short lines, a feature table or short bullets, the screenshots that still help, no walls of text.
- Keep it true: every claim matches today's behavior (v0.9.0).

Done: the new README rendered on GitHub (open the PR's file view); explain what moved where.

## Notes
- 2026-10-05: Done (readme). No video: docs-only change.
PR: https://github.com/iosifnicolae2/better-tasks/pull/15
Commit: 8913680 on task/T-032.
- 2026-10-05: Relaunched; PR #15 still open, no comments or change requests, nothing new to do. Checked every link and image in the README on task/T-032: all point to files that exist.
What moved where:
- README now: one-line idea + demo video picture, How it works (3-column table), Features (7 short bullets), Install (one command; per-project install folded in <details>), First use (3 steps), How approval works, Settings, Update/uninstall (uninstall folded), Contributing.
- "More" removed. Settings details -> one line + link to skills/settings/SKILL.md (unchanged). PR template, project instructions, IntelliJ exclusion feature bullets -> covered by the settings skill (named in the Settings line). Changing better-tasks, dev commands, skills list, optional tools -> new CONTRIBUTING.md. Releases -> CONTRIBUTING.md links CLAUDE.md.
To test: open the rendered README on the branch, read top to bottom, click the links.
Not verified: how GitHub renders it visually (I did not open the page); claims checked against hooks/texts.ts, hooks/pane.tsx, hooks/screen.ts and the settings skill.

### For the user
Links:
[New README, rendered](https://github.com/iosifnicolae2/better-tasks/blob/task/T-032/README.md)
[PR #15](https://github.com/iosifnicolae2/better-tasks/pull/15)
Question:
T-032 Reorganize the README
What changed: the README now opens with the key idea and the demo video, then short sections: how it works, features, install, first use, approval. The long "More" section is gone: settings link to the settings page, developer details moved to CONTRIBUTING.md.
To test: open the rendered README and read it top to bottom.
https://github.com/iosifnicolae2/better-tasks/blob/task/T-032/README.md
https://github.com/iosifnicolae2/better-tasks/pull/15
Is everything OK?
- 2026-10-05: User review of PR #15, request changes (their words): "i want the demo lower, remove how it works, put the screenshot more to top, make sure that the before and after is matching with what's written in the first screenshot.."
So: move the demo video picture lower down; remove the "How it works" section; move the screenshot closer to the top; and the before/after demo must match what the first screenshot shows (the same task/text, so they tell one story). Push to the same PR, and check how GitHub actually renders it this time.
- 2026-10-05: Review changes done, pushed to PR #15 (commits b072a19, cb266d3).
  What changed: screenshot moved to the top under the idea; "How it works" removed; demo video moved into "How approval works"; the board screenshot now shows the same bug as the video (T-007 "Add to cart loses clicks", teammate "shop", editing cart.ts), and First use uses the same example. The story was changed at the source (scripts/screenshots.mjs scenes + tests/screenshots.test.ts data) and all four SVGs regenerated with `node scripts/screenshots.mjs` (it ran fine).
  To test: open https://github.com/iosifnicolae2/better-tasks/blob/task/T-032/README.md (hard refresh: GitHub caches images a few minutes).
  Verified: opened the rendered page on GitHub at cb266d3: screenshot at top shows the cart task, demo picture sits in the approval section, links work.
  Not changed: hooks/board.tsx has a doc comment quoting "Login loops after password reset" (board code, folder-title's area; harmless).
- 2026-10-05: User review #2 of PR #15, request changes (their words): "above the screenshot, display one liner, very condensed of the key value of the project, replace how approval works with something better.. easier to understand.."
So: right above the top screenshot, one very short line with the project's key value (condensed, punchy). And replace the "How approval works" section with something easier to understand (keep the demo video in it). Push to PR #15 and check the rendered page again. (folder-title is finished, so the stale "Login loops" comment in hooks/board.tsx is yours to fix if you like.)
- 2026-10-05: Review #2 done, pushed to PR #15 (commit 3c514d3).
  What changed: one line above the screenshot: "Hand tasks to Claude. Approve each fix from a before/after video." (the longer intro moved under the screenshot). "How approval works" replaced by "Review a finished task": the demo video, then "you answer one question" as a 2-row table (Mark as resolved / Request changes), then one line on one-at-a-time and the PR opening in the browser. hooks/board.tsx doc comment now says "Add to cart loses clicks".
  To test: open https://github.com/iosifnicolae2/better-tasks/blob/task/T-032/README.md and read the top and the review section.
  Verified: rendered on GitHub at 3c514d3: one-liner sits right above the screenshot; video, table and text render cleanly.
- 2026-10-05: User review #3 of PR #15, request changes (their words): "remove from description the before/after video.. just highlight the software as a better way to manage tasks in claude".
So: the one-liner (and the repo/PR description) should not mention the before/after video; it should present better-tasks simply as a better way to manage tasks in Claude (Code). Also update the GitHub repo description if it mentions the video (gh repo edit --description). Push to PR #15.
- 2026-10-05: Review #3 done, pushed to PR #15 (commit 16415e8).
  What changed: README top line is now "A better way to manage tasks in Claude Code." (no video mention). PR description updated to match. GitHub repo description left as is: "Better Task Management for Claude Code" (no video mention already).
  To test: open https://github.com/iosifnicolae2/better-tasks/blob/task/T-032/README.md and read the first line.
  Verified: rendered on GitHub at 16415e8: the new line sits right above the screenshot.
- 2026-10-05: User review #4 of PR #15, request changes (their words): "remove first use.. the before/after list it as a feature and explain that after each task you get a video like the one below to review it..".
So: remove the "First use" section. Add before/after video as a feature in the Features list: after each task you get a video like the one below to review it (point to the demo video in the README). Push to PR #15.
- 2026-10-05: Review #4 done, pushed to PR #15 (commit 56e8c4c).
  What changed: "First use" section removed. Features bullet now: "Before/after video: after each task you get a short narrated video, like the one below, to review it. Turn it on with the demoVideos setting." ("like the one below" links to the Review a finished task section with the demo). The setting note is there because demoVideos is off by default (plugin.json).
  To test: open https://github.com/iosifnicolae2/better-tasks/blob/task/T-032/README.md, read Features, click "like the one below".
  Verified: rendered on GitHub at 56e8c4c: First use gone, the link lands on the demo section.
- 2026-10-05: User review #5 of PR #15 (their words): "rename "👀 Review a finished task" to something better..". Pick a clearer, more inviting heading for that section (and update the "like the one below" link anchor). Push to PR #15.
- 2026-10-05: User (their words): "remove the mark as resolved, request changes..". So: in the README's review section, remove the Mark as resolved / Request changes table (and text about those two answers). Do it together with review #5's heading rename; push to PR #15.
- 2026-10-05: User (their words): "or actually remove the video from readme... keep it only in features as a reference". This replaces review #5 and the table note: remove the whole review section (the demo video, its heading, the Mark as resolved / Request changes table). The before/after video stays only as the Features bullet, which links to the video file itself as a reference (no embedded demo in the README). Push to PR #15.
- 2026-10-05: Reviews #5 and the two follow-ups done, pushed to PR #15 (commits 288d642 rename, db8f995 table removed, 63d5ee2 final).
  What changed (final): the whole video section is gone (heading, embedded demo, Mark as resolved / Request changes table). The Features bullet now reads "Before/after video: after each task you get a short narrated video to review it (see an example). Turn it on with the demoVideos setting." "see an example" links to the video file (jsDelivr, returns 200). Sections now: Features, Install, Settings, Update / uninstall, Contributing.
  To test: open https://github.com/iosifnicolae2/better-tasks/blob/task/T-032/README.md, read Features, click "see an example".
  Verified: rendered on GitHub at 63d5ee2: only the board screenshot is embedded, headings as above, the link points to the video.
  Note: docs/videos/sample-before-after.png (the poster) is no longer used by the README; left in place.
- 2026-10-05: README rewritten: one-line value + board screenshot on top, short Features (before/after video as a linked feature), Install, Settings, Update/uninstall, Contributing; dev details moved to CONTRIBUTING.md; screenshots retold as one story.
