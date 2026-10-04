---
id: T-014
title: Links in the approval question also shown above it as plain text
sprint: 2026-09-28
urgent: false
status: done
owner: demo-videos-2
rolled: 0
order: 0
created: 2026-10-04
---
## Goal
User's request (verbatim): "make sure that all the links, are also in the question but also above the question in normal text so that we can open them from claude mobile and they are clickable.. but keep them in both places.."

What this means for the lead's Finishing (approval) rule in the plugin:
- Every link the approval question carries (PR link, file:// video link, any other test link) stays in the question as now, AND the lead also writes it in its normal reply text right before calling AskUserQuestion. Links inside the question dialog aren't clickable in the Claude mobile app; links in normal text are.
- Same for the other user questions the lead asks with links (e.g. the "user must do something" Done/Skip question).
- Keep each link on its own line in both places, short and unwrapped (lessons from T-011).
- Consider whether a file:// link is useful on mobile at all (the file is on the Mac); a PR link is. Say what you chose.

Done looks like: the lead rule text says this clearly, tests cover it, and the lead's rule as injected into a session shows it.

## Notes
- 2026-10-04: demo-videos-2: done, waiting for the user's review. Commit f6a34d5.

What changed (lead rule text only):
- Finishing got a new bullet (hooks/texts.ts): every link a question carries (a PR, a video, a page to test) sits on a line of its own, with nothing else on that line. The lead puts it in the question AND in its normal reply text right before the AskUserQuestion call. Both places stay: links in the question can't be tapped in the Claude mobile app, links in the reply can. It covers every question the lead asks, including the "Done/Skip" one for things the user must do.
- The video rule (hooks/demovideo.ts) and the PR rule (hooks/pullrequest.ts) each end with: "Like every link, it also goes above the question (Finishing)." The rule is written once, in Finishing.
- file:// links: I kept them in both places, as asked ("all the links"). On the phone a file:// link won't open, since the file is on the Mac. In the terminal and the desktop app it does. The rule tells the lead to repeat it anyway. A PR link opens everywhere.

How to check:
- Start a session with teams on and let a teammate finish a task that has a PR or a video. Before the approval dialog shows, the lead's reply should list the link(s), one per line. Open the session in the Claude mobile app and tap one.
- Tests: a new test checks that the lead's injected prompt has the rule. The video and PR tests check the pointer line. claude plugin test: 194 pass, 0 fail. tsc: clean.

Not verified: a live session, or tapping a link on the phone. I can't drive the real UI or the mobile app.
- 2026-10-04: Resolved by the user. The lead repeats every link of a question (PR, video, test page) in its normal reply right above the question, one per line, so it can be tapped in the Claude mobile app; the copy in the question stays.
