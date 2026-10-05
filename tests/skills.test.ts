import { describe, expect, test } from 'claude-code/testing'

import { fillSkill, ourSkill, skillCall } from '../hooks/skills'

describe('the plugin skills', () => {
  test('called as better-tasks:<name>; only our own skills are filled in', () => {
    expect(skillCall('video')).toBe('better-tasks:video')
    expect(ourSkill('better-tasks:video')).toBe('video')
    expect(ourSkill('testing')).toBe('testing')
    expect(ourSkill('other-plugin:video')).toBeUndefined()
    expect(ourSkill('commit')).toBeUndefined()
  })

  test("a loaded skill gets the plugin's path and its settings on top (none: as it is)", () => {
    const text = 'Run `${CLAUDE_PLUGIN_ROOT}/bin/demo-video.sh`, then `${CLAUDE_PLUGIN_ROOT}/bin/video-branch.sh`.'
    expect(fillSkill(text, '/plugins/better-tasks', '- Video quality: low.')).toBe(
      '## Settings\n- Video quality: low.\n\nRun `/plugins/better-tasks/bin/demo-video.sh`, then `/plugins/better-tasks/bin/video-branch.sh`.',
    )
    expect(fillSkill('Report.', '/p', '')).toBe('Report.')
  })
})
