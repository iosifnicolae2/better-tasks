<!-- The video skill: principles for the before/after video. -->
# Before/after video
The video shows the fix or feature working: your functional test, and what the user sees.
- Separate scenes: BEFORE, then AFTER, a few steps each.
{% if batchDeviceTests %}
- In a batch, the tester records your AFTER (`After: <path>` in your task file): your BEFORE, then its captures, in one spec.
{% endif %}
- Narrate as a colleague explaining the fix or feature: short, plain sentences.
- Screenshots are fine; record the screen when movement or something advanced needs showing. Nothing on screen? Show the old and the new text.
- `{{ bin }}/demo-video.sh spec.json --quality {{ videoQuality }}` makes it, with its poster, from a small spec: `--help` shows the format; marks, arrows and sizes have defaults.
- Never show secrets or personal data (tokens, keys, passwords, emails, private paths, customer data): use test values, or cover them in the image before it goes in the spec.
- Look at the result before you share it. First line under "## Notes": `Video: [<id>.mp4](../tasks_videos/<id>.mp4)`. It goes in your PR (`better-tasks:pull-request`).
