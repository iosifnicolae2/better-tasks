import { describe, expect, test } from 'claude-code/testing'

import { setupVerdict, videoPointer, videoSkillSettings, voiceDir } from '../hooks/demovideo'
import { settingsOf } from '../hooks/settings'

describe('before/after videos', () => {
  test('off until chosen', () => {
    expect(settingsOf({}).demoVideos).toBe(false)
    expect(settingsOf({ demoVideos: true }).demoVideos).toBe(true)
  })

  test('video quality: 1080p medium unless chosen; the video skill reads it, the prompt its capture size', () => {
    expect(settingsOf({}).videoQuality).toBe('medium')
    expect(settingsOf({ videoQuality: 'low' }).videoQuality).toBe('low')
    expect(settingsOf({ videoQuality: '4k' }).videoQuality).toBe('medium')
    expect(videoSkillSettings('medium')).toBe('- Video quality: medium: make it with `--quality medium`.')
    expect(videoPointer('low')).toContain('at 1280x720 or more')
  })

  test("the teammate's prompt says how to capture; the video skill loads only at the finish", () => {
    expect(videoPointer('medium')).toContain('BEFORE first: before you change anything')
    expect(videoPointer('medium')).toContain('made at the finish, after the user accepts: the `better-tasks:video` skill')
    expect(videoPointer('medium')).not.toContain('demo-video.sh')
  })

  test('the voice lives outside any project: its own folder, else XDG data, else ~/.local/share', () => {
    expect(voiceDir({ custom: '/x/kokoro', home: '/Users/a' })).toBe('/x/kokoro')
    expect(voiceDir({ dataHome: '/data', home: '/Users/a' })).toBe('/data/better-tasks/kokoro')
    expect(voiceDir({ home: '/Users/a' })).toBe('/Users/a/.local/share/better-tasks/kokoro')
  })

  test("the setup's last line says whether the voice is ready", () => {
    expect(setupVerdict('ready /Users/a/.local/share/better-tasks/kokoro\n').isReady).toBe(true)
    const failed = setupVerdict('failed: uv is missing: brew install uv (log: /tmp/setup.log)\n')
    expect(failed).toEqual({ isReady: false, text: 'better-tasks: the Kokoro voice setup failed: uv is missing: brew install uv (log: /tmp/setup.log)' })
    expect(setupVerdict('').isReady).toBe(false)
  })
})
