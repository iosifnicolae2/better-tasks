---
id: T-075
title: PR videos open for public users (no GitHub login)
sprint: 2026-10-05
urgent: false
status: done
owner: pr-videos
rolled: 0
order: -2
created: 2026-10-06
---
## Goal
User's words: "also, the uploaded videos in prs can't be opened by public users? why? make it available in a public format.."

1. Find out why: a PR's before/after video (and its poster) is uploaded as a github.com/user-attachments/assets/... link. Check whether that link opens for a visitor who isn't logged in (e.g. curl without auth, or a private browser window off the user's screen), and why not. The cause is likely how the upload is made (bin/task_pr.py / the video skill / demo-video.sh).
2. Make PR videos open for everyone, in a public format. Release notes already serve their video from the repo through cdn.jsdelivr.net/gh/<repo>@<sha>/... (see scripts/release.sh), so that's a candidate. Keep the click-to-play poster in the PR and the video playable in the browser. Repos that are private must keep working (a private repo's videos can stay private; say what happens there).
3. Explain the "why" in plain words in the PR description, so the lead can tell the user.

The repo goes straight to main: commit to main, with a review-only draft PR and a video. That video must itself open without a login. No release until the user approves.

## Notes
Video: [T-075.mp4](../tasks_videos/T-075.mp4)
- 2026-10-06: User clarifies: "if the repo is public, otherwise only to the members which are able to review it..". Public repo: the PR videos open for everyone, with no login. Private repo: they open only for people who can see and review the repo (its members/collaborators), not publicly. A public CDN link (e.g. jsDelivr) must never be used for a private repo.
- 2026-10-06: User asks: "and when i attach a video in a pr, why it's working, couldn't you use the same process?" When the user attaches a video to a PR by hand on github.com, it opens fine. Compare that upload with ours (endpoint, which repo it's tied to, the resulting URL, who can open it) and use the same process if possible. The upload's access then follows the repo's visibility: public for public repos, members only for private ones. Explain the difference in plain words in the PR.
- 2026-10-06 Why: `gh pr create --attach` (gh 2.99+, used on a PR's first open) puts files at github.com/user-attachments/assets/... GitHub serves the poster (an image) to anyone, the video only to someone signed in: logged out it's 404, also days later (PRs #13-#39 all the same). PR updates already used the videos branch via jsDelivr (#40): opens for all. BEFORE: /private/tmp/claude-501/-Users-iosif-Documents-Projects-better-tasks/63e99a05-7e99-4146-b0a1-dd3ea0564d2f/scratchpad/shot/before/ (1-pr.png, 2-video.png, logged-out headless browser).
- 2026-10-06 Fix (c77d714): task_pr.py attaches with gh only when the repo is private (gh repo view visibility PRIVATE/INTERNAL); public repos get the videos branch + jsDelivr, like PR updates already did. scripts/task-pr-check.sh covers both (fails on the old code). README network line updated. Video spec: scratchpad shot/spec.json.
- To test: sh scripts/task-pr-check.sh; then open this task's PR video in a private window.
- 2026-10-06 PR: https://github.com/iosifnicolae2/better-tasks/pull/41 (opened with this repo's bin/task_pr.py: the installed 0.11.10 still attaches until the next release). Checked signed out (headless WebKit, fresh profile): its picture 200, its video 200 and plays (4.2 s of 38.7 s). AFTER shots: scratchpad shot/after/.
- Not done: old PRs (#13-#39) keep their signed-in-only video links; not re-uploaded. Release not touched (none until the user approves). Private-repo case checked only with the stand-in gh, not on a real private repo.

- 2026-10-06 After the user's notes, the real why (tested on PR #41): a hand upload and gh --attach use the same upload (user-attachments). GitHub opens an upload to whoever can see a page that SHOWS it (a picture, or a video URL on its own line, which renders as a player): anyone in a public repo, members in a private one. Our PRs only linked the video behind the poster, so it stayed signed-in only. Proof: a link-only upload stayed 404 signed out; shown as a player it turned 302; removed from the page, it went back to 404. Private test repo (better-tasks-pr-video-test PR #2, I appended a test video there): signed out 404 after 3+ min, signed in 302.
- 2026-10-06 Rework (444f922): task_pr.py attaches for public and private repos alike and also shows the video as a player ("Or play it here", <details>) under the poster (show_player fills in gh's link); a new video on an open PR is attached too (was jsDelivr). Videos branch only without gh 2.99+ (jsDelivr only for a public repo, as video-branch.sh already checks). Replaces c77d714's jsDelivr-for-public. Check script covers player, new-video attach, no-gh fallback. New video uploaded to PR #41 by the real update path.
- Not done: old PRs keep link-only videos. bin/open-pr.sh checks the link signed in, so it can open a PR a minute before visitors can play it (not my file). A link takes a little while to open after the player appears (73 s for this PR's video; the player on the page plays right away).

- 2026-10-06 Hand upload vs gh, compared. gh (traced with GH_DEBUG=api on the private test repo, PR #2 comment): POST uploads.github.com/user-attachments/assets?name=..&content_type=..&repository_id=<repo>, token auth, gives github.com/user-attachments/assets/<uuid>. github.com drop (its own page code, behaviors-*.js on github.githubassets.com): POST to the form's data-upload-policy-url (github.com/upload/policies/assets) with repository_id + CSRF token from a signed-in browser, upload to S3, PUT asset_upload_url to confirm; same user-attachments/<uuid> link, tied to the same repo. Then it writes a video as "\n<href>\n" (a bare line, so a player), an image as ![name](href). That last step is the only difference that mattered. Could we use github.com's own process? Its endpoint needs a browser session (cookie + CSRF), not a token, so a script can't. gh's upload is its scripted twin, so we keep gh and now write the video the way github.com does. Public once the PR is public: yes, as a player (PR #41: 302 signed out); private: members only (test repo: 404 signed out, 302 signed in). Not checked: an actual hand drop (needs the user's signed-in browser; not used). PR #41 description now has this comparison table.

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/41
T-075 PR videos open for public users (no GitHub login)
Why: your hand-attached video and ours go to the same place on GitHub, tied to the repo. The difference: github.com puts a video in the description as a player, and GitHub only opens an upload to the public once the page shows it. We only put a link to it behind the picture, so signed-out people got a 404.
Now we do it the same way: the video is uploaded with gh and shown as a player under the picture. In a public repo anyone can watch it; in a private one, only its members. (github.com's own upload button needs your browser login, so a script can't use it; gh's upload is the same thing for scripts.)
- 2026-10-06 Accepted. Full tests: claude plugin test . 322 pass, 0 fail; scripts/*-check.sh all ok. Review PR #41 closed (task_pr.py close). Commits on main: c77d714, 444f922 (pushed with the lead's push; no release until approved).
- 2026-10-06: PR videos are now uploaded with gh and also shown as a player, like github.com does, so they open for anyone in public repos and only for members in private ones. jsDelivr is only the fallback without gh 2.99+, and never for a private repo. 322 tests pass; review PR #41 closed. Old PRs #13–#39 keep their link-only videos. Not released yet.
