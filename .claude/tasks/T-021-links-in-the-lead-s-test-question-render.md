---
id: T-021
title: Links in the lead's test question render properly and are clickable in Claude Code
sprint: 2026-10-05
urgent: false
status: done
owner: question-links
rolled: 0
order: -3
created: 2026-10-05
---
## Goal
User's words: "also in the quesiton make sure to render the links properly and they are clickable in claude code"

Context: when a teammate finishes, the lead asks the user to test with AskUserQuestion; the question carries links (PR url, file:// video link). The rules today say: each link on its own line with nothing else, and also repeat it in the reply text above the question. The user says the links in the question are not rendered/clickable properly in Claude Code.

Goal: find how AskUserQuestion's question text renders in the Claude Code terminal (and the desktop app) and what makes a link clickable there (plain url, markdown link, OSC 8 hyperlink, file:// vs https, line wrapping that breaks long urls, etc.). Then change the lead rules (and anything the plugin generates) so links in the question are clickable.

Done: a real test question in Claude Code where clicking the PR link and the video link opens them; explain in plain words what was wrong and what changed.

## Notes
Video: [T-021.mp4](../tasks_videos/T-021.mp4)
- 2026-10-05: question-links: findings so far (Claude Code 2.1.289, read from its binary and tested live in tmux). The question text is drawn as plain bold text with a "│ " bar on the left. It has no markdown and no OSC 8 hyperlink (a terminal code that makes text clickable). Only Claude Code's own internal confirm dialogs turn [label](file:///...) into links; a question from the model never does. So a link in the question is clickable only if the terminal finds the url itself, and the user's sessions run in IntelliJ's terminal. A url wider than the terminal gets cut onto the next line, and that line starts with "│ ", so the terminal sees two broken pieces. At 60 columns the 85-character file:// video link breaks; the PR link (about 45 characters) fits. Markdown [text](url) in a question shows as raw text. Captures are in scratchpad qtest/before-60cols.txt and before-100cols.txt.
- 2026-10-05: question-links: verified in tmux with TERMINAL_EMULATOR=JetBrains-JediTerm, the same setting as IntelliJ. Claude Code wraps links in the reply text, both [label](url) and bare urls, in OSC 8 hyperlinks, so they stay clickable and show a short label. The same url inside the question gets no OSC 8. Raw output had 4 OSC 8 codes, all from the reply text. Plan: put every link in the reply text above the question as a markdown link with a short label, which is the reliable click. Keep only short links (a PR url) in the question, as a bare url on its own line. Leave the long file:// video link out of the question and write "video: link above" instead. Waiting for the lead's real-terminal check before editing.
- 2026-10-05: Link check result, user's words: "none of them is opening.. i don't see it like a clickable link" (neither the https link nor the file:// link in the AskUserQuestion question was clickable or shown as a link). Terminal not stated.
- 2026-10-05: question-links: done. Video: [T-021.mp4](../tasks_videos/T-021.mp4). My worktree can't edit this file, so lead: please move the Video line to be the first line under Notes. PR: https://github.com/iosifnicolae2/better-tasks/pull/4 (commit f6c3b00, branch task/T-021).

Cause: Claude Code draws the question as plain text. Links in the reply text get OSC 8, a terminal code that makes text clickable; the question never does. Long links there also wrap into broken pieces. The user confirmed that neither link opened.

What changed: in hooks/texts.ts, the Finishing rule now says every link goes in the reply text right before AskUserQuestion, never in the question. Each link is a markdown link with a short label on its own line, e.g. [PR #12](url) or [T-004 video](file:///...), with spaces as %20. The question only says "Links: above this question". hooks/demovideo.ts and hooks/pullrequest.ts now point their video and PR links there, labeled "<task id> video" and "PR #<number>". Tests in tests/core.test.tsx are updated, and claude plugin test passes 212/212.

How to test: after the next release, let a teammate finish. The lead's reply should show "PR #n" or "<id> video" above the question; clicking one opens it. The question has no urls.

Checked in tmux as a JetBrains terminal: the reply labels carry OSC 8 links. Not checked: a real click in the user's IntelliJ terminal, and the Claude desktop app. No plugin code builds these links; they come only from these rule texts.
- 2026-10-05: User (Request changes): "go also inside the questions, before they were clickable.. i don't know if a claude code udpated broke them.." So: links go in BOTH places, above the question (labels) AND inside the question (bare url on its own line), as the old rule had. And investigate whether a Claude Code update stopped links in the question from being clickable (they used to work for the user): compare versions / changelog; if it's a Claude Code regression, say so plainly so the user can report it.
- 2026-10-05: question-links: change request done. PR https://github.com/iosifnicolae2/better-tasks/pull/4 is rebased on main a51da80, commits f1da100, 3f5c96e and 2288ca8. Video: [T-021.mp4](../tasks_videos/T-021.mp4), remade.

What changed: links go in two places again. Above the question, as markdown links with a short label. Inside the question, as the bare url on its own line, like the old rule. pullrequest.ts keeps its line starting "- A finished task", so the dev-branch flow gets the same wording; its test is updated. claude plugin test: 244/244 pass.

Is it a Claude Code update? Not between the installed versions: 2.1.287 and 2.1.289 both draw the question with no link code. Older versions aren't on this Mac. Likely cause: the user's ~/.claude/settings.json has "tui": "fullscreen". Fullscreen takes over the mouse, so the terminal stops opening links. Claude Code then opens a url, in the question or above it, only on a click that the terminal sends with Cmd/Alt (SGR bit 8) or Ctrl (bit 16). A plain click opens nothing. I tested this in tmux with a fake "open" that logs: a modifier-click opened the reply label, the https link in the question and the file link in the question (that one with open -R, which reveals the file in Finder instead of playing it). A plain click opened nothing. Whether IntelliJ sends Cmd with the click is unknown; if not, Cmd-click does nothing there. Claude Code only special-cases this for Ghostty and Warp.

How to test: in IntelliJ, try plain click, Cmd, Ctrl and Alt on a link above the question and on one inside it. If none open, try without "tui": "fullscreen" (normal mode), where IntelliJ handles the clicks itself.

Not verified: a real click in IntelliJ.
- 2026-10-05: Links go both above the question (labeled markdown links) and inside it (bare url); likely cause of unclickable links is "tui": "fullscreen" in IntelliJ, not a Claude Code update.
