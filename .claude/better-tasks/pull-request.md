<!-- The pull-request skill: the task's PR, opened as a draft before the user is asked to approve. -->
# Pull request
Every task has one, opened as a draft{% if demoVideos %} with the video{% endif %} before you report done: the user checks the task from it. Never merge it yourself.
{% if isReviewPr %}
- Straight to main: it is for review only, a draft into the commit before your task's, that never merges.
{% endif %}
- The description is short and plain, read on a phone: {% if hasOwnPrTemplate %}this project's template (`{{ prTemplate }}`){% else %}the user's request and why, then what changed and how to test it{% endif %}. Write it to a file.
- `python3 {{ bin }}/task_pr.py open <id> --body-file <file>` pushes your commits and opens the PR{% if demoVideos %} with the video in it{% endif %}; its last line is the PR's URL (--help).
- A change later: {% if gitFlow == "dev-prs" %}land it on `{{ devBranch }}`{% elif isWorktree %}commit it{% else %}land it{% endif %}, then open again: it pushes it{% if demoVideos %}, and a new video takes the old one's place{% endif %}.
- After the user's yes and the full tests: {% if isReviewPr %}`task_pr.py close <id>`{% else %}open again with --ready; watch its checks and fix what fails{% endif %}.
- Notes: "PR: <url>".
