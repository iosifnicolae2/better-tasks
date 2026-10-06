import { describe, expect, test } from 'claude-code/testing'

import { ourSkill, skillCall } from '../hooks/skills'

describe('the plugin skills', () => {
  test('called as better-tasks:<name>; only our own skills are filled in', () => {
    expect(skillCall('video')).toBe('better-tasks:video')
    expect(ourSkill('better-tasks:video')).toBe('video')
    expect(ourSkill('testing')).toBe('testing')
    expect(ourSkill('other-plugin:video')).toBeUndefined()
    expect(ourSkill('commit')).toBeUndefined()
  })

})
