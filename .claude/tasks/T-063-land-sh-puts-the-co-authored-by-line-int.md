---
id: T-063
title: land.sh puts the Co-Authored-By line into the commit subject
sprint: 2026-10-05
urgent: false
status: done
owner: land
rolled: 0
order: -3
created: 2026-10-06
---
## Goal
Reported by teammate approval-flow (2026-10-06); the user said to file it. When bin/land.sh gets several -m messages, it joins them with a single newline instead of a blank line, the way `git commit -m a -m b` does. The Co-Authored-By trailer then becomes part of the subject. See it with `git log --oneline -1 3e09cf6` (also 0767ecb and 53ec53e).

Done: land.sh separates each -m message with a blank line, so the subject is only the first message and trailers stay trailers. Show the before/after of `git log --oneline` / `git log -1` in the video. Don't rewrite the pushed commits.

## Notes
Video: [T-063.mp4](../tasks_videos/T-063.mp4)
- 2026-10-06: bin/land.sh now puts a blank line between -m messages (commit 9593498). Tried in a scratch repo: `land.sh -m "Subject" -m "Co-Authored-By: X <x@y>"` gives subject "Subject" alone, and `git log -1 --format='%(trailers)'` lists the Co-Authored-By. Commit 9593498 itself shows it: `git log --oneline -1 9593498`. No automated test for land.sh exists; none added. Nothing on screen beyond git log output.

### For the user
Question:
T-063 land.sh puts the Co-Authored-By line into the commit subject
What changed: commits made by teammates now keep the Co-Authored-By line out of the title; it sits below a blank line, like git commit does.
To try it: run git log --oneline -3 and see that the newest T-063 commit shows only its title.
Is everything OK?
- 2026-10-06: Finished: full tests pass (claude plugin test .: 316 pass). Straight to main, so 9593498 is final.
- 2026-10-06: land.sh separates -m messages with a blank line, so Co-Authored-By stays a trailer, out of the subject
