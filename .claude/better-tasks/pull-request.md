<!-- The pull-request skill: opening the PR after the user's yes. -->
# Pull request
Opened after the user's yes, with the video. Never merge it yourself.
- The description is short and plain, read on a phone: {% if hasOwnPrTemplate %}this project's template (`{{ prTemplate }}`){% else %}the user's request and why, then what changed and how to test it{% endif %}. Write it to a file.
- `python3 {{ bin }}/task_pr.py open <id>{% if gitFlow != "dev-prs" %} --here{% endif %} --body-file <file>` pushes the branch and opens the PR with the video in it (--help).
- Watch its checks; fix what fails. A change later: {% if gitFlow == "dev-prs" %}land it on `{{ devBranch }}` and{% else %}push it and{% endif %} run open again.
- Notes: "PR: <url>".
