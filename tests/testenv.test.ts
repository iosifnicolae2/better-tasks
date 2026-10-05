import { describe, expect, test } from 'claude-code/testing'

import { coordinatorTestingRules, OFFSCREEN_QUESTION, testingRules } from '../hooks/testenv'

describe('testing like a user', () => {
  test('every teammate tests in its own environment and reports new bugs to the lead', () => {
    for (const isOffScreen of [true, false]) {
      const rules = testingRules(isOffScreen)
      expect(rules).toContain('Your own test environment')
      expect(rules).toContain('never the user\'s running apps, data or accounts')
      expect(rules).toContain('"New bug: <what you saw>, <how to see it again>"')
      expect(rules).toContain('claude mcp add --transport stdio xcode -- xcrun mcpbridge')
    }
  })

  test('off-screen: a hidden browser, simulator or terminal, and never the user\'s screen', () => {
    const rules = testingRules(true)
    expect(rules).toContain('chromium.launch({ headless: true })')
    expect(rules).toContain('booted without the Simulator app')
    expect(rules).toContain('emulator -avd <name> -no-window')
    expect(rules).toContain('tmux capture-pane')
    expect(rules).toContain('CGEvent postToPid')
    expect(rules).toContain('screencapture -x -o -l <window id>')
    expect(testingRules(false)).not.toContain('headless: true')
    expect(testingRules(false)).toContain('Tell the lead first')
  })

  test('the lead tells the user about new bugs and files them only when asked', () => {
    expect(coordinatorTestingRules(false)).toContain('File it (task_create) only when they say so.')
    expect(coordinatorTestingRules(false)).not.toContain('Off-screen is on')
    expect(coordinatorTestingRules(true)).toContain('Off-screen is on')
  })

  test('the question says what stays the user\'s and what cannot run off-screen', () => {
    expect(OFFSCREEN_QUESTION).toContain('your screen, mouse and keyboard stay yours')
    expect(OFFSCREEN_QUESTION).toContain('a step that needs a real click waits until you are away')
  })
})
