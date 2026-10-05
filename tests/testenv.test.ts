import { describe, expect, test } from 'claude-code/testing'

import { fieldsWith, nextOption } from '../hooks/configpage'
import { PROJECT_KEYS, settingsOf } from '../hooks/settings'
import { coordinatorTestingRules, screenNames, testingPointer, testingSkillSettings } from '../hooks/testenv'

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
})

describe('the test screen', () => {
  const screenRow = (screens: string[]) => fieldsWith(screens).find(field => field.field === 'testScreen')!
  const withScreen = (testScreen?: string) => settingsOf(testScreen === undefined ? {} : { testScreen })

  test('the virtual display by default, saved in the project only', () => {
    expect(withScreen().testScreen).toBe('virtual')
    expect(withScreen('  ').testScreen).toBe('virtual')
    expect(PROJECT_KEYS).toContain('testScreen')
  })

  test('the settings page cycles the virtual display, then each connected screen by name', () => {
    const row = screenRow(['Built-in Retina Display', 'DELL U2720Q'])
    expect(row.options).toEqual(['virtual display', 'Built-in Retina Display', 'DELL U2720Q'])
    expect(row.value(withScreen())).toBe('virtual display')
    const next = nextOption(row.options, row.value(withScreen()))
    expect(row.stored(next)).toBe('Built-in Retina Display')
    expect(row.stored(nextOption(row.options, 'DELL U2720Q'))).toBe('virtual')
  })

  test('a chosen screen that is gone shows as not connected; Enter goes back to the virtual display', () => {
    const row = screenRow(['Built-in Retina Display'])
    expect(row.value(withScreen('DELL U2720Q'))).toBe('DELL U2720Q · not connected')
    expect(row.stored(nextOption(row.options, row.value(withScreen('DELL U2720Q'))))).toBe('virtual')
  })

  test("the screens' names from record-display.sh screens", () => {
    expect(screenNames('2\tLG ULTRAFINE\n1\tBuilt-in Retina Display\n')).toEqual(['LG ULTRAFINE', 'Built-in Retina Display'])
    expect(screenNames('')).toEqual([])
  })

  test('the testing skill names the screen', () => {
    expect(testingSkillSettings(true)).toContain("Test screen: the project's own virtual display")
    expect(testingSkillSettings(true, 'DELL U2720Q')).toContain('Test screen: "DELL U2720Q", a real screen the user chose')
  })
})
