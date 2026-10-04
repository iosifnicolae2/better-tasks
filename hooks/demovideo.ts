// Before/after videos (setting demoVideos): the startup question, the one-time Kokoro voice setup
// (bin/kokoro-setup.sh, outside any project) and the rules that have teammates make the video and the
// lead show it. The video itself is bin/demo-video.sh's work. The parts that need `$` are in register.tsx.

export const ASKED_KEY = 'demoVideosAsked'
export const ENABLE_OPTION = 'Enable (recommended)'
export const SETTING_KEY = 'better-tasks.demoVideos'

export const QUESTION =
  'Make a short before/after video for each finished task? A teammate records the bug, then the fix, ' +
  'labels them BEFORE and AFTER, marks what changed with red boxes and arrows, and a voice reads the ' +
  'subtitles. The voice (Kokoro) is set up once on this computer, about 1 GB. Change it later in /better-tasks config.'

/** Where kokoro-setup.sh installs; it writes `.ready` there once done. */
export function voiceDir(env: { custom?: string; dataHome?: string; home?: string }): string {
  return env.custom ?? `${env.dataHome ?? `${env.home ?? '~'}/.local/share`}/better-tasks/kokoro`
}

export const SETUP_TOAST = 'Setting up the Kokoro voice for before/after videos: once, a few minutes.'

export const setupArgv = (root: string) => ['/bin/sh', `${root}/bin/kokoro-setup.sh`]

/** The setup script's verdict: its last line, "ready <dir>" or "failed: why". */
export function setupVerdict(output: string): { isReady: boolean; text: string } {
  const last = output.trim().split('\n').pop() ?? ''
  return last.startsWith('ready')
    ? { isReady: true, text: 'Kokoro voice ready: before/after videos are on.' }
    : { isReady: false, text: `better-tasks: the Kokoro voice setup ${last || 'failed'}` }
}

export function teammateRules(root: string): string {
  return `## Before/after video (on in this project)
Finished work that shows on screen comes with one short narrated video. Nothing to see (a refactor, a config)? Skip it and say so in your notes.
- BEFORE first: before you change anything, capture the bug or the missing feature. Forgot? Capture it from the last commit before yours (git worktree add <scratchpad>/before <commit>).
- Capture with what the project has: Playwright for web (a screenshot per step, or recordVideo); the mobile MCP for iOS/Android (mobile_start_screen_recording / mobile_stop_screen_recording, or screenshots); else \`screencapture -x shot.png\` or \`screencapture -v -V <seconds> clip.mov\` on macOS. A screenshot per step is often clearest.
- AFTER: the same steps on your change.
- Spec: a JSON file (format at the top of ${root}/bin/demo_video.py), its "name" the task id ("T-004.mp4"): a BEFORE clip and an AFTER clip, 1–4 steps each. Per step one short, plain sentence (shown and read aloud), a red box around what matters and an arrow pointing at it, in the pixels of the image or video.
- Make it: \`${root}/bin/demo-video.sh spec.json\`. Inputs stay in your scratchpad, never in the project; the video goes to ~/Movies/better-tasks/ and the script prints its file:// link. Check a frame or two (\`ffmpeg -ss <second> -i video.mp4 -frames:v 1 frame.png\`): the boxes and arrows land on target.
- Your notes get the line "Demo video: <the file:// link it printed>", exactly as printed: short, so it fits on one row and opens on click.`
}

export const COORDINATOR_RULES = `## Before/after videos (on)
- A finished task's notes hold "Demo video: file://…". In Finishing, the question shows that link exactly, on a line of its own with nothing else on it (no quotes, backticks or punctuation), so it fits on one row and opens on click.
- Work that shows on screen but has no video: ask its teammate for one before asking the user.`
