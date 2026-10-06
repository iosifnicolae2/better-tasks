<!-- The testing skill: principles for testing like a user. -->
# Testing like a user
- Set up your own environment to test like a user: your own instance, port and data, never the user's apps, data or accounts.
- Drive it with the best tools you have (MCP servers, a headless browser, simulators, tmux){% if offScreen %}, off the user's screen: their screen, mouse and keyboard stay theirs{% endif %}.
- Mac apps run on the test screen{% if isVirtualScreen %}, the project's own virtual display{% else %}, "{{ testScreen }}"{% endif %}: `{{ bin }}/record-display.sh` (--help) gives you a turn on it and records.
- Test it as a user would: the real steps, the real result. Passing tests alone don't count.
- Find bugs and surprises; raise them with a recording.
- Leave a build the user can try, ready but not opened, and say in your notes how to open it.
