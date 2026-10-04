import { describe, expect, test } from 'claude-code/testing'

import { setupVerdict, teammateRules, voiceDir } from '../hooks/demovideo'
import { settingsOf } from '../hooks/settings'

describe('before/after videos', () => {
  test('off until chosen', () => {
    expect(settingsOf({}).demoVideos).toBe(false)
    expect(settingsOf({ demoVideos: true }).demoVideos).toBe(true)
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

  test('the teammate rules point at the installed scripts', () => {
    const rules = teammateRules('/plugins/better-tasks')
    expect(rules).toContain('/plugins/better-tasks/bin/demo-video.sh spec.json')
    expect(rules).toContain('/plugins/better-tasks/bin/demo_video.py')
    expect(rules).toContain('Video: [T-004.mp4](../tasks_videos/T-004.mp4)')
  })
})
