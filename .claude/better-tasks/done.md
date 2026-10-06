<!-- The done skill: how a teammate reports finished work, and finishes after the user's yes. -->
# Reporting done
- Quick checks: the tests near your change, and your own try as a user.
{% if demoVideos %}
- The before/after video (`better-tasks:video`).
{% endif %}
- Notes in the task file: what changed, the commits, what you couldn't check. End with a short block the lead shows the user, plain words, no jargon:
```
### For the user
{% if demoVideos %}
Video: [<absolute path>](file://<absolute path>)
{% endif %}
<id> <title>
<what changed, in a line or two>
```
- Tell the lead: "<id> done: <commits>, see <task file>". Then wait.

## After the user's answer
- Changes asked: make them, a new video if it changed, report again.
- "<id> accepted: finish it": the full tests{% if hasPr %}, then your PR (`better-tasks:pull-request`){% endif %}. Then "<id> finished: <{% if hasPr %}PR url{% else %}commits{% endif %}>".
