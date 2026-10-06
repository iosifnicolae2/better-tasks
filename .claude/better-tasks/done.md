<!-- The done skill: how a teammate reports finished work, and finishes after the user's yes. -->
# Reporting done
The user approves from links: the PR{% if demoVideos %}, with the video in it{% endif %}, and the release when your task changes one.
- Quick checks: the tests near your change, and your own try as a user.
{% if demoVideos %}
- The before/after video (`better-tasks:video`).
{% endif %}
- The draft PR (`better-tasks:pull-request`). Your task changes a release (its notes, its video, how it's cut)? Also a draft release with your change{% if demoVideos %}, the release video in its notes{% endif %}.
- Notes in the task file: what changed, the commits, a small bug you fixed on the way, what you couldn't check. End with a short block the lead shows the user, plain words, no jargon:
```
### For the user
PR: <url>
Release: <url, only when your task changes a release>
<id> <title>
<what changed, in a line or two>
```
- Tell the lead: "<id> done: <PR url>, see <task file>". Then wait.

## After the user's answer
- Changes asked: make them{% if demoVideos %}, a new video if it changed{% endif %}, run the PR's open again, report again.
- "<id> accepted: finish it": the full tests, then {% if isReviewPr %}your review PR closed{% else %}your PR marked ready{% endif %} (`better-tasks:pull-request`). Then "<id> finished: <PR url>".
