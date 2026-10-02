import { describe, expect, test } from 'claude-code/testing'

import { addDays, dayOf, nextSprint, sprintEnd, sprintLabel, sprintNumber, sprintStart } from '../hooks/sprints'

const WEEKLY_MONDAY = { weeks: 1, startDay: 1 } as const
const TWO_WEEKS_MONDAY = { weeks: 2, startDay: 1 } as const

describe('sprint dates', () => {
  test('a weekly sprint starts on the Monday on or before the day', () => {
    expect(sprintStart('2026-10-03', WEEKLY_MONDAY)).toBe('2026-09-28') // Saturday
    expect(sprintStart('2026-10-05', WEEKLY_MONDAY)).toBe('2026-10-05') // Monday itself
    expect(sprintStart('2026-10-11', WEEKLY_MONDAY)).toBe('2026-10-05') // Sunday
    expect(sprintStart('2026-10-12', WEEKLY_MONDAY)).toBe('2026-10-12')
  })

  test('another start day', () => {
    const sunday = { weeks: 1, startDay: 0 } as const
    expect(sprintStart('2026-10-03', sunday)).toBe('2026-09-27')
    expect(sprintStart('2026-10-04', sunday)).toBe('2026-10-04')
  })

  test('two-week sprints keep fixed boundaries', () => {
    const start = sprintStart('2026-10-03', TWO_WEEKS_MONDAY)
    expect(['2026-09-21', '2026-09-28']).toContain(start)
    expect(sprintStart(addDays(start, 13), TWO_WEEKS_MONDAY)).toBe(start)
    expect(sprintStart(addDays(start, 14), TWO_WEEKS_MONDAY)).toBe(addDays(start, 14))
    expect(nextSprint(start, TWO_WEEKS_MONDAY)).toBe(addDays(start, 14))
    expect(sprintEnd(start, TWO_WEEKS_MONDAY)).toBe(addDays(start, 13))
  })

  test('the end of a year', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(sprintStart('2027-01-01', WEEKLY_MONDAY)).toBe('2026-12-28')
  })

  test('week numbers are ISO weeks', () => {
    expect(sprintNumber('2026-10-05')).toBe(41)
    expect(sprintNumber('2026-12-28')).toBe(53)
    expect(sprintNumber('2027-01-04')).toBe(1)
  })

  test('labels', () => {
    expect(sprintLabel('2026-10-05', WEEKLY_MONDAY)).toBe('Sprint 41 · Oct 5–11')
    expect(sprintLabel('2026-09-28', WEEKLY_MONDAY)).toBe('Sprint 40 · Sep 28–Oct 4')
    expect(sprintLabel('2026-10-05', TWO_WEEKS_MONDAY)).toBe('Sprint 41 · Oct 5–18')
  })

  test('dayOf reads the local calendar day', () => {
    const noon = new Date(2026, 9, 3, 12).getTime()
    expect(dayOf(noon)).toBe('2026-10-03')
  })
})
