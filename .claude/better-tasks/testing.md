<!-- The testing skill: principles for testing like a user. -->
# Testing like a user
- Set up your own environment to test like a user: your own instance, port and data, never the user's apps, data or accounts.
- Drive it with the best tools you have (MCP servers, a headless browser, simulators, tmux){% if offScreen %}, off the user's screen: their screen, mouse and keyboard stay theirs{% endif %}.
- Mac apps run on the test screen{% if isVirtualScreen %}, the project's own virtual display{% else %}, "{{ testScreen }}"{% endif %}: `{{ bin }}/record-display.sh` (--help) gives you a turn on it and records{% if isVirtualScreen %}; it makes the display when there is none and keeps it, and tasks at the same time take turns on it. Never the user's screens instead{% endif %}.
{% if liveReview %}
- Live review is on: in your turn on the test screen, `{{ bin }}/live-review.sh start --watch "<what to check>"` (--help) has Gemini report what you asked and flag anything not OK, each at its second. Then look at each reported moment in the recording yourself; its list goes in the task file.
{% endif %}
- Test it as a user would: the real steps, the real result. Passing tests alone don't count.
- Find bugs and surprises; raise them with a recording.
- Leave a build the user can try, ready but not opened, and say in your notes how to open it.
