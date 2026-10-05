import { describe, expect, test } from 'claude-code/testing'

import { coordinatorTestingRules, OFFSCREEN_QUESTION, testingPointer, testingSkillSettings } from '../hooks/testenv'

describe('testing like a user', () => {
  test("every teammate's prompt keeps the boundaries and the bug report, and points at the testing skill", () => {
    for (const isOffScreen of [true, false]) {
      const rules = testingPointer(isOffScreen)
      expect(rules).toContain('in your own environment')
      expect(rules).toContain("never the user's running apps, data or accounts")
      expect(rules).toContain('"New bug: <what you saw>, <how to see it again>"')
      expect(rules).toContain('load the `better-tasks:testing` skill')
      expect(rules).not.toContain('headless: true')
    }
    expect(testingPointer(true)).toContain('nor their screen, mouse or keyboard (off-screen is on)')
    expect(testingPointer(false)).not.toContain('off-screen is on')
  })

  test('the testing skill reads which of its parts applies', () => {
    expect(testingSkillSettings(true)).toContain('Off-screen: on. Follow "Off-screen"')
    expect(testingSkillSettings(false)).toContain('Off-screen: off. Follow "On the screen"')
  })

  test('the lead tells the user about new bugs and files them only when asked', () => {
    expect(coordinatorTestingRules(false)).toContain('File it (task_create) only when they say so.')
    expect(coordinatorTestingRules(false)).not.toContain('Off-screen is on')
    expect(coordinatorTestingRules(true)).toContain('Off-screen is on')
  })

  test('the question says what stays the user\'s and what cannot run off-screen', () => {
    expect(OFFSCREEN_QUESTION).toContain('your screen, mouse and keyboard stay yours')
    expect(OFFSCREEN_QUESTION.length).toBeLessThan(120)
  })
})
