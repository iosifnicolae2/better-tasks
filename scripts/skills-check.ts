// Checks the skills in skills/: each one the hooks point at exists, loads by its name, stays out of the
// slash menu, and still says what its users rely on. (The test runner can't read files, so this does.)
// Run: `bun scripts/skills-check.ts`; exits 1 and names what is missing.
import { readFileSync } from 'node:fs'

const root = new URL('..', import.meta.url).pathname

/** Per skill, phrases its readers (teammates, the lead, the hooks' "Settings") depend on. */
const MUST_SAY: Record<string, string[]> = {
  video: [
    '${CLAUDE_PLUGIN_ROOT}/bin/demo_video.py',
    '${CLAUDE_PLUGIN_ROOT}/bin/demo-video.sh spec.json --quality',
    'with its poster beside it (<task id>.png: BEFORE and AFTER side by side with a big play button, for a PR)',
    'give it `"poster": true` and a `"focus": [x, y, w, h]`',
    '${CLAUDE_PLUGIN_ROOT}/bin/video-branch.sh <video> <poster>',
    'Video: [T-004.mp4](../tasks_videos/T-004.mp4)',
    'Made at done, before the user is asked',
    'Nothing changes on screen? Show the change itself',
  ],
  testing: [
    'claude mcp add --transport stdio xcode -- xcrun mcpbridge',
    '## Off-screen: when "Settings" above says it is on',
    'chromium.launch({ headless: true })',
    'booted without the Simulator app',
    'emulator -avd <name> -no-window',
    'tmux capture-pane',
    'CGEvent postToPid',
    '${CLAUDE_PLUGIN_ROOT}/bin/record-display.sh run -- <your script>',
    'never make, move or remove virtual displays yourself',
    'screencapture -x -o -l <window id>',
    'Notify first, save the pointer, move it back',
    '## On the screen: when off-screen is off',
    '## A local build, ready at done',
  ],
  done: [
    '### For the user',
    'the PR and the video come before the question',
    'Quick checks first: the tests near your change',
    'A local build, ready but not installed or opened',
    '"Full tests: running"',
    '"T-004 full tests pass"',
    'Video: [/Users/me/app/.claude/tasks_videos/T-004.mp4](file:///Users/me/app/.claude/tasks_videos/T-004.mp4)',
    'The question\'s only link is the PR: the bare url on a line of its own, nothing else on it',
    'Never the video: it\'s in Links.',
    '"T-004 done: <commits or PR url>, see <task file>"',
    'never set it done yourself',
  ],
  contribute: ['gh repo fork iosifnicolae2/better-tasks --clone', 'CLAUDE_CODE_PLUGIN_DIRS', '/reload-plugins', 'as "Settings" above says'],
  'pull-request': [
    `[![Before/after video: click to play it with sound](<poster's absolute path>)](<video's absolute path>)\nClick the picture to play the video with sound (Cmd-click or Ctrl-click: in a new tab).`,
    'git push -u origin HEAD:task/T-004',
    `--attach <poster's absolute path> --attach <video's absolute path>`,
    "gh can't attach (older than 2.99, or the upload failed)? Put the video on the videos branch",
    '--attach <poster> --attach <video>',
    'python3 ${CLAUDE_PLUGIN_ROOT}/bin/task_pr.py open T-004 --body-file <scratchpad>/pr.md',
    '## Worktree and PR per task: when "Settings" says so',
    '## Shared dev branch: when "Settings" says so',
    'Never fix on the task branch',
    '`gh pr checks <n> --watch --fail-fast >/dev/null; gh pr checks <n>`',
    'a title with a quote mark and the word git, or starting with "git", is refused: reword it',
    'as your prompt\'s "gh and git in your worktree" says',
    'Never merge it yourself',
    'The PR opens at done, with its video, before the user is asked',
  ],
}

const problems: string[] = []
for (const [name, phrases] of Object.entries(MUST_SAY)) {
  const path = `${root}skills/${name}/SKILL.md`
  let text = ''
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    problems.push(`${name}: no ${path}`)
    continue
  }
  if (!text.startsWith(`---\nname: ${name}\nuser-invocable: false\ndescription: `)) problems.push(`${name}: front matter (name, user-invocable: false, description)`)
  if (!/^# /m.test(text)) problems.push(`${name}: no "# " title: the hooks put "Settings" under it`)
  for (const phrase of phrases) if (!text.includes(phrase)) problems.push(`${name}: lacks ${JSON.stringify(phrase)}`)
}

if (problems.length > 0) {
  console.error(`skills-check:\n${problems.map(problem => `- ${problem}`).join('\n')}`)
  process.exit(1)
}
console.log(`skills-check: ${Object.keys(MUST_SAY).length} skills say what they must`)
