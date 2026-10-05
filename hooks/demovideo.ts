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

/** The teammate's pointer: the how-to is the video skill, loaded only by work that shows on screen. */
export const TEAMMATE_POINTER = `## Before/after video (on in this project)
Finished work that shows on screen comes with one short narrated video, its BEFORE captured before you change anything, made once the user accepts. Such work: load the \`${skillCall('video')}\` skill before your first change; it says how. Nothing to see (a refactor, a config)? No video; say so in your notes.`

/** What the video skill reads under its title: this project's quality and the capture size it needs. */
export function videoSkillSettings(quality: VideoQuality): string {
  return `- Video quality: ${quality}. Capture at ${VIDEO_SIZE[quality]} or more; make it with \`--quality ${quality}\`.`
}
