<!-- The pull-request skill: how a teammate opens and updates its PR, after the user's yes. -->
# Pull request
Opened after the user's yes, with the video. Never merge it yourself: the lead does once its checks pass.
- Description in `<scratchpad>/pr.md`, short and plain (the user reads it on a phone): {% if hasOwnPrTemplate %}this project's template, `{{ prTemplate }}`: its sections, with{% else %}"## Asked for" (the user's words), "## Why",{% endif %} the video right after the request, {% if not hasOwnPrTemplate %}"## What changed", "## To test", "## Notes", {% endif %}then the commits and the task file's path. The video as its poster linking to it, so it plays with sound: `[![Before/after video: click to play it with sound](<poster>)](<video>)`.
{% if gitFlow == "dev-prs" %}
- `python3 {{ pluginRoot }}/bin/task_pr.py open <id> --body-file <scratchpad>/pr.md`: it puts your task's commits from `{{ devBranch }}` on `task/<id>`, pushes and opens the PR with the video. A change or a conflict: land the fix on `{{ devBranch }}` and run it again; a commit it can't place: tell the lead.
{% else %}
- `git push -u origin HEAD:task/<id>`, then `gh pr create --base main --head task/<id> --title "<id> <title>" --body-file <scratchpad>/pr.md --attach <poster> --attach <video>`. gh can't attach: `{{ pluginRoot }}/bin/video-branch.sh <video> <poster>` gives links to use instead.
- A change: push to the same branch (`gh pr edit --body-file … --attach …` for a new video). A conflict: merge origin/main, fix, test, push.
{% endif %}
- Watch its checks in the background: `gh pr checks <n> --watch --fail-fast`. No GitHub remote: no PR, say so in your notes.
- Notes: "PR: <url>".
