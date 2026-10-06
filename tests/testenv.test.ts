import { describe, expect, test } from 'claude-code/testing'

import { fieldsWith, nextOption } from '../hooks/configpage'
import { PROJECT_KEYS, settingsOf } from '../hooks/settings'
import { screenNames } from '../hooks/testenv'

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

})
