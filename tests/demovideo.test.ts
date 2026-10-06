import { describe, expect, test } from 'claude-code/testing'

import { defaultBrowserId, setupVerdict, videoPage, videoPagePath, videoPointer, videoSkillSettings, voiceDir } from '../hooks/demovideo'
import { PROJECT_KEYS, settingsOf } from '../hooks/settings'

describe('before/after videos', () => {
  test('off until chosen', () => {
    expect(settingsOf({}).demoVideos).toBe(false)
    expect(settingsOf({ demoVideos: true }).demoVideos).toBe(true)
  })

  test('release videos: on unless the project turns them off, in its config.json', () => {
    expect(settingsOf({}).releaseVideos).toBe(true)
    expect(settingsOf({ releaseVideos: false }).releaseVideos).toBe(false)
    expect(PROJECT_KEYS).toContain('releaseVideos')
  })

  test('video quality: 1080p medium unless chosen; the video skill reads it, the prompt its capture size', () => {
    expect(settingsOf({}).videoQuality).toBe('medium')
    expect(settingsOf({ videoQuality: 'low' }).videoQuality).toBe('low')
    expect(settingsOf({ videoQuality: '4k' }).videoQuality).toBe('medium')
    expect(videoSkillSettings('medium')).toBe('- Video quality: medium: make it with `--quality medium`.')
    expect(videoPointer('low')).toContain('at 1280x720 or more')
  })

  test("the teammate's prompt says how to capture, for every task; the video skill loads at done, before the user is asked", () => {
    expect(videoPointer('medium')).toContain('BEFORE first: before you change anything')
    expect(videoPointer('medium')).toContain('Every finished task gets one short narrated video, docs, rules and tooling too.')
    expect(videoPointer('medium')).toContain('labeled BEFORE and AFTER')
    expect(videoPointer('medium')).not.toContain('No video')
    expect(videoPointer('medium')).toContain('made at done, before the user is asked: the `better-tasks:video` skill')
    expect(videoPointer('medium')).not.toContain('demo-video.sh')
  })

  test('the voice lives outside any project: its own folder, else XDG data, else ~/.local/share', () => {
    expect(voiceDir({ custom: '/x/kokoro', home: '/Users/a' })).toBe('/x/kokoro')
    expect(voiceDir({ dataHome: '/data', home: '/Users/a' })).toBe('/data/better-tasks/kokoro')
    expect(voiceDir({ home: '/Users/a' })).toBe('/Users/a/.local/share/better-tasks/kokoro')
  })

  test('the board plays a video in a page beside it, in the default browser (Safari when none is set)', () => {
    expect(videoPagePath('/p/.claude/tasks_videos/T-004.mp4')).toBe('/p/.claude/tasks_videos/T-004.html')
    const page = videoPage('/p/.claude/tasks_videos/T-004.mp4')
    expect(page).toContain('<title>T-004 · before/after video</title>')
    expect(page).toContain('<video src="T-004.mp4" controls autoplay playsinline>')
    const chrome = [{ LSHandlerURLScheme: 'http', LSHandlerRoleAll: 'org.mozilla.firefox' }, { LSHandlerURLScheme: 'https', LSHandlerRoleAll: 'com.google.chrome' }]
    expect(defaultBrowserId(JSON.stringify(chrome))).toBe('com.google.chrome')
    expect(defaultBrowserId('[]')).toBe('com.apple.safari')
    expect(defaultBrowserId('not json')).toBe('com.apple.safari')
  })

  test("the setup's last line says whether the voice is ready", () => {
    expect(setupVerdict('ready /Users/a/.local/share/better-tasks/kokoro\n').isReady).toBe(true)
    const failed = setupVerdict('failed: uv is missing: brew install uv (log: /tmp/setup.log)\n')
    expect(failed).toEqual({ isReady: false, text: 'better-tasks: the Kokoro voice setup failed: uv is missing: brew install uv (log: /tmp/setup.log)' })
    expect(setupVerdict('').isReady).toBe(false)
  })
})
