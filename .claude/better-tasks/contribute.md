<!-- The contribute skill: how the lead handles a change to better-tasks itself. -->
# Changes to better-tasks itself
A task like any other; put steps 1–3 in its goal.
1. Fork: `gh repo fork iosifnicolae2/better-tasks --clone` into ~/.claude/better-tasks/fork (there already: pull it).
2. Change it in the fork, on a branch named for the task; `claude plugin test <fork>` runs the tests.
3. Linked install, once: `claude plugin disable better-tasks@better-tasks`, and the fork's path in `CLAUDE_CODE_PLUGIN_DIRS` in the `env` of ~/.claude/settings.json; /reload-plugins applies an edit.
{% if upstreamPr == "never" %}
4. The user said never to upstream PRs: don't ask.
{% else %}
4. Once the user resolved it, ask with AskUserQuestion, header "PR upstream": "Open a PR to the better-tasks repo?", options "Yes, open a PR" (push the branch, `gh pr create --repo iosifnicolae2/better-tasks`), "Not now", "Never". Save the answer with upstream_pr.
{% endif %}
