import type { VideoQuality } from './settings'

// Before/after videos (setting demoVideos): the startup question, the one-time Kokoro voice setup
// (bin/kokoro-setup.sh, outside any project) and the rules that have teammates make the video and the
// lead show it. The video itself is bin/demo-video.sh's work. The parts that need `$` are in register.tsx.

export const ENABLE_OPTION = 'Enable (recommended)'
export const SETTING_KEY = 'better-tasks.demoVideos'
/** Where bin/demo-video.sh saves a task's video, <task id>.mp4, relative to the project root; git ignores it. */
export const VIDEOS_FOLDER = '.claude/tasks_videos'
/** The size a video of each quality fits in (setting videoQuality); bin/demo_video.py holds the same table. */
const VIDEO_SIZE: Record<VideoQuality, string> = { low: '1280x720', medium: '1920x1080', high: '1920x1080' }

export const QUESTION =
  'Make a short before/after video for each finished task? A teammate records the bug, then the fix, ' +
  'labels them BEFORE and AFTER, marks what changed with red boxes and arrows, and a voice reads the ' +
  'subtitles. The voice (Kokoro) is set up once on this computer, about 1 GB. Change it later in /better-tasks config.'

/** Where kokoro-setup.sh installs; it writes `.ready` there once done. */
export function voiceDir(env: { custom?: string; dataHome?: string; home?: string }): string {
  return env.custom ?? `${env.dataHome ?? `${env.home ?? '~'}/.local/share`}/better-tasks/kokoro`
}

export const SETUP_TOAST = 'Setting up the Kokoro voice for before/after videos: once, a few minutes.'

/** AppleScript that opens a video in QuickTime Player and plays it at once, sound on. */
export function quickTimePlay(path: string): string {
  const quoted = JSON.stringify(path) // a path's " and \\ escaped as AppleScript wants them
  return [
    'tell application "QuickTime Player"',
    'activate',
    `set movie to open POSIX file ${quoted}`,
    'set muted of movie to false',
    'set audio volume of movie to 1',
    'play movie',
    'end tell',
  ].join('\n')
}

export const setupArgv = (root: string) => ['/bin/sh', `${root}/bin/kokoro-setup.sh`]

/** The setup script's verdict: its last line, "ready <dir>" or "failed: why". */
export function setupVerdict(output: string): { isReady: boolean; text: string } {
  const last = output.trim().split('\n').pop() ?? ''
  return last.startsWith('ready')
    ? { isReady: true, text: 'Kokoro voice ready: before/after videos are on.' }
    : { isReady: false, text: `better-tasks: the Kokoro voice setup ${last || 'failed'}` }
}

export function teammateRules(root: string, quality: VideoQuality = 'medium'): string {
  return `## Before/after video (on in this project)
Finished work that shows on screen comes with one short narrated video. Nothing to see (a refactor, a config)? Skip it and say so in your notes.
- BEFORE first: before you change anything, capture the bug or the missing feature. Forgot? Capture it from the last commit before yours (git worktree add <scratchpad>/before <commit>).
- Capture with what the project has: Playwright for web (a screenshot per step, or recordVideo); the mobile MCP for iOS/Android (mobile_start_screen_recording / mobile_stop_screen_recording, or screenshots); else \`screencapture -x shot.png\` or \`screencapture -v -V <seconds> clip.mov\` on macOS. A screenshot per step is often clearest. Capture at ${VIDEO_SIZE[quality]} or more (a Playwright viewport of that size; a device or Retina screen already is).
- AFTER: the same steps on your change.
- Spec: a JSON file (format at the top of ${root}/bin/demo_video.py), its "name" the task id ("T-004.mp4"): a BEFORE clip and an AFTER clip, 1–4 steps each. Per step one short, plain sentence (shown and read aloud), a red box around what matters and an arrow pointing at it, in the pixels of the image or video.
- Make it: \`${root}/bin/demo-video.sh spec.json --quality ${quality}\` (the project's video quality). Inputs stay in your scratchpad; the video goes to the project's ${VIDEOS_FOLDER}/ (git ignores it), with its poster beside it (<task id>.png: an AFTER frame with a big play button, for a PR); the script prints the poster's file:// link, then the video's. Check a frame or two (\`ffmpeg -ss <second> -i video.mp4 -frames:v 1 frame.png\`): the boxes and arrows land on target.
- Online copy, when gh can't upload it (the PR rules say when): \`${root}/bin/video-branch.sh <video> <poster>\` commits both to the branch better-tasks-videos (its own history, never merged: videos stay out of main and out of the task's branch), pushes it and prints their web links (video first), then the caption that fits them.
- Your task file gets, as the first line under "## Notes", the line \`Video: [T-004.mp4](../tasks_videos/T-004.mp4)\` (the path relative to the task file). A newer video replaces the file, not the line.`
}

export const COORDINATOR_RULES = `## Before/after videos (on)
- A finished task with a video has a "Video:" line in its task file. In Finishing, its link file://<project root>/${VIDEOS_FOLDER}/<task id>.mp4 goes above and in the question like every link (Finishing), labeled "<task id> video" above. Only without a PR: with one (PR per task), the PR link replaces it: the PR's picture opens the video.
- Work that shows on screen but has no video: ask its teammate for one before asking the user.`
