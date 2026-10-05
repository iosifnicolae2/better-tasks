import type { VideoQuality } from './settings'
import { skillCall } from './skills'

// Before/after videos (setting demoVideos): the startup question, the one-time Kokoro voice setup
// (bin/kokoro-setup.sh, outside any project), the teammate's pointer to the video skill (skills/video)
// with the settings that skill reads, and the lead's rule to show the video. The video itself is bin/demo-video.sh's work. The parts that need `$` are in register.tsx.

export const ENABLE_OPTION = 'Enable (recommended)'
export const SETTING_KEY = 'better-tasks.demoVideos'
/** Where bin/demo-video.sh saves a task's video, <task id>.mp4, relative to the project root; git ignores it. */
export const VIDEOS_FOLDER = '.claude/tasks_videos'
/** The size a video of each quality fits in (setting videoQuality); bin/demo_video.py holds the same table. */
const VIDEO_SIZE: Record<VideoQuality, string> = { low: '1280x720', medium: '1920x1080', high: '1920x1080' }

export const QUESTION =
  'Record a short before/after video for each finished task?'

/** Where kokoro-setup.sh installs; it writes `.ready` there once done. */
export function voiceDir(env: { custom?: string; dataHome?: string; home?: string }): string {
  return env.custom ?? `${env.dataHome ?? `${env.home ?? '~'}/.local/share`}/better-tasks/kokoro`
}

export const SETUP_TOAST = 'Setting up the Kokoro voice for before/after videos: once, a few minutes.'

// The board's "Video" action plays the video in the default browser: a small page beside the video
// (<task id>.html, git ignores the folder) opened with the browser itself, since `open` on an .mp4
// starts QuickTime and on an .html may start an editor.

/** The page that plays a task's video, written beside it: <task id>.html. */
export const videoPagePath = (video: string) => video.replace(/\.mp4$/, '.html')

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * A dark page that plays the video, with its controls, filling the window. A browser that blocks
 * sound until a click gets a big "Play with sound" button instead of a still, silent frame.
 */
export function videoPage(video: string): string {
  const name = video.split('/').pop() ?? video
  const title = escapeHtml(name.replace(/\.mp4$/, ''))
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title} · before/after video</title>
<style>html,body{margin:0;height:100%;background:#111}video{width:100%;height:100%;object-fit:contain}
button{position:fixed;inset:0;margin:auto;width:340px;height:96px;border:0;border-radius:48px;background:#d77757;color:#fff;font:600 28px system-ui,sans-serif;cursor:pointer}</style></head>
<body><video src="${escapeHtml(encodeURIComponent(name))}" controls autoplay playsinline></video>
<button hidden>▶ Play with sound</button>
<script>
const video = document.querySelector('video')
const button = document.querySelector('button')
button.onclick = () => video.play()
video.onplay = () => { button.hidden = true }
video.play().catch(() => { button.hidden = false })
</script></body></html>
`
}

/** macOS: the default browser's app id, from LaunchServices' handlers (`plutil -extract LSHandlers json`); Safari when none is set. */
export function defaultBrowserId(handlersJson: string): string {
  try {
    const handlers = JSON.parse(handlersJson) as { LSHandlerURLScheme?: string; LSHandlerRoleAll?: string }[]
    return handlers.find(handler => handler.LSHandlerURLScheme === 'https' && handler.LSHandlerRoleAll)?.LSHandlerRoleAll ?? SAFARI
  } catch {
    return SAFARI
  }
}

const SAFARI = 'com.apple.safari'

export const handlersArgv = (home: string) => [
  'plutil', '-extract', 'LSHandlers', 'json', '-o', '-',
  `${home}/Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist`,
]

export const setupArgv = (root: string) => ['/bin/sh', `${root}/bin/kokoro-setup.sh`]

/** The setup script's verdict: its last line, "ready <dir>" or "failed: why". */
export function setupVerdict(output: string): { isReady: boolean; text: string } {
  const last = output.trim().split('\n').pop() ?? ''
  return last.startsWith('ready')
    ? { isReady: true, text: 'Kokoro voice ready: before/after videos are on.' }
    : { isReady: false, text: `better-tasks: the Kokoro voice setup ${last || 'failed'}` }
}

/** The teammate's pointer: capturing is here, so the video skill loads only at the finish, to make it. */
export function videoPointer(quality: VideoQuality): string {
  return `## Before/after video (on in this project)
Work that shows on screen gets one short narrated video. Nothing to see (a refactor, a config)? No video; say so in your notes.
- BEFORE first: before you change anything, capture the bug or missing feature (how: the testing skill), at ${VIDEO_SIZE[quality]} or more, a screenshot per step. Forgot? Capture it from the commit before yours (\`git worktree add <scratchpad>/before <commit>\`).
- AFTER: the same steps on your change. Keep both in your scratchpad.
- The video is made at the finish, after the user accepts: the \`${skillCall('video')}\` skill.`
}

/** What the video skill reads under its title: this project's quality. */
export function videoSkillSettings(quality: VideoQuality): string {
  return `- Video quality: ${quality}: make it with \`--quality ${quality}\`.`
}
