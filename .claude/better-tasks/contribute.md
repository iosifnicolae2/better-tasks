<!-- The contribute skill: how the lead handles a change to better-tasks itself. -->
# Changes to better-tasks itself
A task like any other, done in the user's fork:
- Fork iosifnicolae2/better-tasks into ~/.claude/better-tasks/fork (or pull it), change it on a branch, `sh <fork>/scripts/test.sh`.
- Run the fork as a linked install: disable the installed better-tasks and add the fork's path to `CLAUDE_CODE_PLUGIN_DIRS` in ~/.claude/settings.json; /reload-plugins applies edits.
{% if upstreamPr == "never" %}
- The user said never to upstream PRs: don't ask.
{% else %}
- Once resolved, ask (header "PR upstream") whether to open a PR to the better-tasks repo: "Yes, open a PR", "Not now", "Never". Save the answer with upstream_pr.
{% endif %}
