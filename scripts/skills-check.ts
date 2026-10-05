// Checks the skills in skills/: each one the hooks point at exists, loads by its name, stays out of the
// slash menu, and still says what its users rely on. (The test runner can't read files, so this does.)
// Run: `bun scripts/skills-check.ts`; exits 1 and names what is missing.
import { readFileSync } from 'node:fs'

const root = new URL('..', import.meta.url).pathname

/** Per skill, phrases its readers (teammates, the lead, the hooks' "Settings") depend on. */
const MUST_SAY: Record<string, string[]> = {
  video: [
    'BEFORE first: before you change anything',
    '${CLAUDE_PLUGIN_ROOT}/bin/demo_video.py',
    '${CLAUDE_PLUGIN_ROOT}/bin/demo-video.sh spec.json --quality',
    'with its poster beside it (<task id>.png: an AFTER frame with a big play button, for a PR)',
    '${CLAUDE_PLUGIN_ROOT}/bin/video-branch.sh <video> <poster>',
    'Video: [T-004.mp4](../tasks_videos/T-004.mp4)',
    'the size "Settings" above names',
  ],
  testing: [
    "never the user's running apps, data or accounts",
    'claude mcp add --transport stdio xcode -- xcrun mcpbridge',
    '"New bug: <what you saw>, <how to see it again>"',
    '## Off-screen: when "Settings" above says it is on',
    'chromium.launch({ headless: true })',
    'booted without the Simulator app',
    'emulator -avd <name> -no-window',
    'tmux capture-pane',
    'CGEvent postToPid',
    'screencapture -x -o -l <window id>',
    '## On the screen: when off-screen is off',
  ],
  done: [
    '### For the user',
    'Under "Links:", each a markdown link with a short label on a line of its own',
    'In the question: the bare url, each on a line of its own with nothing else on it',
    'With a PR: its link, no video link',
    '"T-004 done: <commits>, see <task file>"',
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
    'Never merge it yourself',
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
