---
id: T-015
title: "README: features section, with the before/after video as a demo"
sprint: 2026-10-05
urgent: false
status: done
owner: readme-2
rolled: 1
order: 0
created: 2026-10-04
---
## Goal
User's request (verbatim): "create in readme.md a section with the features supported.. also below it add the before/after video as demo on how it works that feautre because it's cool"

What this means:
- README.md gets a "Features" section listing what better-tasks supports, in plain words (one short line each; take them from the code and the current README, don't invent). It includes the new ones: before/after videos (T-011), PR per task (T-012), automatic gh update (T-013), links above the approval question (T-014).
- Below that list, the before/after video as a demo of the feature. The user turned down a README video earlier (T-011, a poster image linking to a committed mp4); now they want it, so this request wins.
- Make the video play right in the README on GitHub if possible. GitHub plays a video inline only from a user-attachments URL (github.com/user-attachments/assets/...); a committed mp4 doesn't play inline. gh 2.99+ (`gh pr create --attach`, see T-012's notes) uploads to user-attachments. Check if that or a similar route gives a URL that plays in the README. If nothing works, use a poster image that links to the video, and say why.
- Source video: /Users/iosif/Documents/Projects/better-tasks/.claude/tasks_videos/T-011.mp4 (git-ignored, so don't commit from there). Regenerating a fresher sample is fine if it shows the feature better.
- Keep the README's style: keywords over paragraphs, say a thing once.

Done looks like: committed on main, not pushed; how it will look on GitHub checked as well as possible before the push.

## Notes
- 2026-10-04: readme: Features section committed (43bac49); it replaces "Use" so nothing is said twice. Video: waiting for the lead's OK to upload it to user-attachments with a direct POST (the same call gh --attach makes, but no PR or issue). The demo section text is held in scratchpad/demo-section.md.
- 2026-10-05: User decided: "Upload, play inline". Go ahead with the one-time upload of the sample video to GitHub user-attachments (direct POST, as the readme teammate proposed; no PR, issue or branch), and put the returned URL in the README so it plays on the page. The user also said "continue the push of the readme": once it's committed and checked, report and the lead pushes.
- 2026-10-05: readme-2: Demo video added below Features (commit 78aebbf, not pushed). What I did: uploaded .claude/tasks_videos/T-011.mp4 (768 KB, 28 s) once, with a direct POST to uploads.github.com/user-attachments/assets (repository_id 1402493063, the user's gh token). That created no PR, issue or branch. URL: https://github.com/user-attachments/assets/8a4dc144-ff65-4e8b-a2dd-c2dfd205ceac. README: a "Demo" heading, one line of text, then the bare URL on its own line. Checks: with the user's login the URL redirects to the mp4 (200, video/mp4, the bytes match the source file). GitHub's markdown API turns the section into a <video> player. Not verified: logged out, the URL gives 404 for now. Attachments that something references already open logged out (302), so ours should open once the pushed README references it. That can only be checked after the push. How to test after the push: open the README on GitHub in a private window; the video should play. Or run `curl -sI <URL>`: it should give 302, not 404. If it still gives 404, the fix is to reference the URL once in a comment on this repo, but ask the user first because a comment is visible.
- 2026-10-05: Resolved by the user. README has a Features section and, below it, a Demo section whose before/after video plays inline from a GitHub user-attachment (checked logged out). Pushed.
- 2026-10-05: User (reopened): "for features, keep them very short, with one descriptive emoji, only the most important features of the product". So: cut the README Features section down to the few most important features, one short line each, each starting with one emoji that describes it. Details (settings, keys, versions) don't belong there. Keep the Demo video section below it as is.
- 2026-10-05: readme-2: Features section shortened (commit 9fe1517, not pushed). It is now 7 one-line items, each starting with one emoji: Markdown tasks, sprint board, team of agents, you approve, before/after videos, PR per task, /away. The Demo video section is unchanged. I moved two details out of Features into "More" so they stay in the README: the Settings line, and a new "Optional tools" line (ffmpeg + uv for videos, gh for PRs). Dropped as too detailed: board keys, status check, worktree option, prompt cache, keep-awake, the sprints.md/docs/tasks.md paths, and the gh auto-update. How to test: open README.md on GitHub after the push and read the Features list. Not committed: docs/tasks.md has a change from someone else.
- 2026-10-05: Resolved by the user. README: a short Features list (7 lines, one emoji each) and the before/after demo video below it, playing inline.
