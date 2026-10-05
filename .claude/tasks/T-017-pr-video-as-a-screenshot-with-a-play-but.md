---
id: T-017
title: PR video as a screenshot with a play button that opens the video with sound
sprint: 2026-10-05
urgent: false
status: done
owner: pr-video
rolled: 0
order: 0
created: 2026-10-05
---
## Goal
User's request (verbatim): "make sure that the video is linked in the pr using a screenshot and then when clicked on it open in a new tab the video so that it stars with the audio turned on"

Context: with "PR per task" on (T-012), the teammate attaches the before/after mp4 to the PR with `gh pr create --attach`; GitHub shows it as an inline player that always starts muted. In the README (T-015) the user preferred a different approach: one screenshot of the video with a big play button in the middle (docs/videos/before-after-poster.png, made by readme-2), and clicking it opens the mp4 directly in the browser, where it plays with sound.

What this means:
- In the PR body, replace the inline video with a picture: a frame of the video with a big play button in the middle, generated automatically by the video maker (bin/demo_video.py / demo-video.sh) for every video. Reuse how the README poster was made.
- Clicking the picture opens the mp4 itself (not GitHub's player), so the browser plays it with sound.
- Find a URL that works for both public and private repos. jsDelivr (used in the README) only serves public repos and needs the file committed; the PR video isn't committed (.claude/tasks_videos is git-ignored). A user-attachments URL from `--attach` (for both the poster and the mp4) works for private repos for logged-in viewers. Check what that URL opens in a browser tab (the raw mp4 plays with sound?) and pick what works; say why.
- "New tab": GitHub strips target="_blank" from markdown links, so a plain click opens in the same tab; say if that holds for PR bodies too.
- Prove it on a real test PR in a throwaway private repo (the old iosifnicolae2/better-tasks-pr-test was deleted by the user; make a new throwaway one and say its name so the user can delete it), not on the real repo.

Done looks like: committed on main (not pushed), tests pass, a real test PR link in the notes where the screenshot shows and the click plays the video with sound.

## Notes
- 2026-10-05: pr-video: done, waiting for the user's review. Commits 15e55f4, f0c0105 (on main, not pushed).

What changed:
- Video maker (bin/demo_video.py): every video now gets a poster next to it, <task id>.png in .claude/tasks_videos/ (git-ignored). The poster is a frame of the AFTER clip, 1 s into its first step (so the red marks and subtitle show), with a big round play button in the middle. It is drawn the same way as the README poster. The script prints the poster's file:// link, then the video's (still last).
- PR rule (hooks/pullrequest.ts): the PR body shows the poster as a picture linking to the mp4, with a text line right under it:
  [![Before/after video: click to play it with sound](<poster>)](<video>)
  Click the picture to play the video with sound.
  plus `--attach <poster> --attach <video>`. gh uploads both and points the picture and the link at them (gh's own code handles a picture inside a link; checked on a real PR).
- The text line is needed. Alone in its paragraph, GitHub turns a link to an attached video into its muted inline player and drops the picture. That happened on the first try (PR #1's first version). With any text in the same paragraph, it stays a picture link (checked with GitHub's markdown API and on PR #2).
- Rule text updated in pullrequest.ts and demovideo.ts (teammate: the poster exists; lead: "the PR's picture opens the video"). New and updated tests.

Which URL, and why: the user-attachments URL that `--attach` returns, for both the poster and the mp4. It works for private repos: GitHub checks the viewer's login, then redirects to a short-lived signed S3 link served as video/mp4 with no Content-Disposition, so the browser plays it in the tab instead of downloading it. Logged out it gives 404 on a private repo, which is expected. jsDelivr (README) can't be used: it only serves public repos, and the PR video isn't committed.

What the click does (checked): in Chrome, logged in, clicking the picture on PR #1 went to the signed S3 mp4 in the same tab. The video element there had autoplay on, muted=false, volume 1. Chrome's automation tab was in a background window, which holds back media loading, so I checked the playback itself in Playwright (Chromium) with a fresh signed link to the same file: it started by itself, unmuted, volume 1, 2.9 s in after 3 s, decoding audio.

New tab: no. GitHub removes target="_blank" in PR bodies too (the rendered HTML and the live page show a bare <a href>). A plain click opens the video in the same tab; Cmd-click (or middle-click) opens a new tab.

Test PRs (throwaway private repo iosifnicolae2/better-tasks-pr-video-test, delete when done: gh repo delete iosifnicolae2/better-tasks-pr-video-test, may need gh auth refresh -s delete_repo):
- https://github.com/iosifnicolae2/better-tasks-pr-video-test/pull/2 has a body written exactly as the new rule says (the one to check)
- https://github.com/iosifnicolae2/better-tasks-pr-video-test/pull/1 is the same, with the caption added by an edit after the first try showed the player

How to check: open PR #2 logged in. You see one picture (the AFTER frame with a play button) and the line "Click the picture to play the video with sound." Click it: the mp4 opens and plays with the narration audible.

Checks: claude plugin test . shows 212 pass, 0 fail. tsc -p . is clean. A real render (demo-video.sh with a two-step spec) wrote the mp4 and png; the poster looks right.

Not verified: Safari and Firefox (Safari may need one click on play); hearing the sound with my own ears (I checked the audio state: unmuted, volume 1, audio decoding); a full live teammate cycle with the setting on.
- 2026-10-05: User review (request changes): "make sure to open the video in a new tab". Known limit (pr-video's note): GitHub removes target="_blank" from links in PR bodies, so a page can't force a new tab; only the viewer's Cmd-click or middle-click does. Lead asked the user which fallback they want.
- 2026-10-05: User chose: "Look for a workaround" (over a Cmd-click hint). Find a real way for a click on the PR picture to open the video in a new tab with sound, and prove it on the test PR. Ideas to check: a small landing page (e.g. GitHub Pages, a gist preview, or another host) that the picture links to and that opens the video; whether GitHub keeps any target or rel on links in some form (HTML <a> variants, <details>, image maps); browser behavior for links to media. Only check the ones that are real. If nothing gives a true new tab, say so plainly with what you tried, and fall back to the Cmd-click hint line under the picture. Don't spend more than a focused try on this.
- 2026-10-05: pr-video: new-tab workaround search done. I found no real way, so I used the fallback (commit 3efc322, not pushed).

What I tried (with GitHub's markdown API and the test PR's real URLs):
- HTML <a href target="_blank" rel="noopener">: GitHub removes target and rel.
- Markdown link with an attribute list {:target="_blank"}: not supported, removed.
- Image map <map><area target="_blank">: map and area are removed.
- <base target="_blank">, and <form target="_blank"> with a button: removed.
- GitHub's own target="_blank": GitHub adds it only on the wrapper it puts around a standalone picture, and that wrapper opens the picture itself, never another URL. For an outside image it opens GitHub's camo image proxy (images only), so a video can't ride on it.
- A landing page (Pages, a gist, another host) doesn't help. The click still replaces the PR tab, and a page can't open a new tab by itself (pop-up blocker). It would also need a public host, which doesn't fit private repos.

Fallback: the caption line under the picture is now "Click the picture to play the video with sound (Cmd-click or Ctrl-click: in a new tab)." The rule says why (GitHub drops target="_blank"). Tests 212 pass, tsc clean.

Test PR updated with the new caption: https://github.com/iosifnicolae2/better-tasks-pr-video-test/pull/2. How to check: Cmd-click the picture; the video opens in a new tab and plays with sound. A plain click opens it in the same tab.
- 2026-10-05: Resolved by the user. Each video gets a poster (AFTER frame + big play button); the PR shows the poster linking to the attached mp4, which plays with sound; caption says Cmd/Ctrl-click opens a new tab (GitHub strips target="_blank", no workaround found).
