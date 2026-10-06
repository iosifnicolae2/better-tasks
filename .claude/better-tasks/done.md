<!-- The done skill: how a teammate reports finished work. -->
# Reporting done
1. Quick checks: the tests near your change, and your own try as a user.
{% if demoVideos %}
2. The before/after video (`better-tasks:video`), made from your BEFORE and AFTER captures.
{% else %}
2. A build the user can try (the `better-tasks:testing` skill's "Ready for the user").
{% endif %}
3. In the task file's Notes, dated: what changed, the commits, what you could not verify. Last, the block the lead shows the user (a newer one replaces the old):
```
### For the user
{% if demoVideos %}
Video: [/abs/path/.claude/tasks_videos/T-004.mp4](file:///abs/path/.claude/tasks_videos/T-004.mp4)
{% else %}
Try it: <a link or one command>
{% endif %}
T-004 Fix login redirect
After login you land on the page you asked for.
```
   Plain words, no jargon (commits, branches, test counts).
4. Tell the lead in one line: "T-004 done: <commits>, see <task file>". Then wait.

## After the user's answer
- Changes asked: make them, a new video if what it shows changed, steps 3–4 again.
- "T-004 accepted: finish it": the full test suite{% if hasPr %}, then your PR with the video (`better-tasks:pull-request`) and its checks{% endif %}. A failure: fix it and tell the lead. Then "T-004 finished: <{% if hasPr %}PR url{% else %}commits{% endif %}>".
