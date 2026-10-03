import { describe, expect, test } from 'claude-code/testing'

import {
  addDays,
  datesLabel,
  dayOf,
  daysLeftLabel,
  nextSprint,
  sprintEnd,
  sprintLabel,
  sprintNumber,
  sprintStart,
  sprintTitle,
  weekLabel,
  weekNumber,
} from '../hooks/sprints'

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
    expect(weekNumber('2026-10-05')).toBe(41)
    expect(weekNumber('2026-12-28')).toBe(53)
    expect(weekNumber('2027-01-04')).toBe(1)
    expect(weekNumber('2027-01-01')).toBe(53) // a Friday: still the old year's last week
  })

  test('1 to 4 weeks: length, end, week label and number', () => {
    const cases = [
      [1, '2026-10-05', '2026-10-11', 'Week 41', 41],
      [2, '2026-09-28', '2026-10-11', 'Weeks 40–41', 20],
      [3, '2026-10-05', '2026-10-25', 'Weeks 41–43', 14],
      [4, '2026-09-28', '2026-10-25', 'Weeks 40–43', 10],
    ] as const
    for (const [weeks, start, end, weeksText, number] of cases) {
      const config = { weeks, startDay: 1 }
      expect(sprintStart('2026-10-07', config)).toBe(start)
      expect(sprintEnd(start, config)).toBe(end)
      expect(sprintStart(end, config)).toBe(start)
      expect(sprintStart(addDays(end, 1), config)).toBe(addDays(end, 1))
      expect(weekLabel(start, config)).toBe(weeksText)
      expect(sprintNumber(start, config)).toBe(number)
    }
  })

  test('week labels across the year boundary', () => {
    expect(weekLabel('2026-12-28', WEEKLY_MONDAY)).toBe('Week 53')
    expect(weekLabel('2027-01-04', WEEKLY_MONDAY)).toBe('Week 1')
    const start = sprintStart('2026-12-30', TWO_WEEKS_MONDAY)
    expect(weekLabel(start, TWO_WEEKS_MONDAY)).toMatch(/^Weeks (52–53|53–1)$/)
    expect(datesLabel('2026-12-28', WEEKLY_MONDAY)).toBe('Mon Dec 28 – Sun Jan 3')
  })

  test('a Sunday start counts the week most of it lies in', () => {
    const sunday = { weeks: 1, startDay: 0 } as const
    expect(weekLabel('2026-10-04', sunday)).toBe('Week 41')
    expect(datesLabel('2026-10-04', sunday)).toBe('Sun Oct 4 – Sat Oct 10')
  })

  test('labels and days left', () => {
    expect(sprintLabel('2026-10-05', WEEKLY_MONDAY)).toBe('Sprint 41 · Week 41 · Mon Oct 5 – Sun Oct 11')
    expect(sprintLabel('2026-09-28', TWO_WEEKS_MONDAY)).toBe('Sprint 20 · Weeks 40–41 · Mon Sep 28 – Sun Oct 11')
    expect(sprintTitle('2026-10-05', WEEKLY_MONDAY, '2026-10-09')).toBe('Sprint 41 · Week 41 · Mon Oct 5 – Sun Oct 11 · 3 days left')
    expect(daysLeftLabel('2026-10-10', '2026-10-05', WEEKLY_MONDAY)).toBe('2 days left')
    expect(daysLeftLabel('2026-10-11', '2026-10-05', WEEKLY_MONDAY)).toBe('last day')
  })

  test('dayOf reads the local calendar day', () => {
    const noon = new Date(2026, 9, 3, 12).getTime()
    expect(dayOf(noon)).toBe('2026-10-03')
  })
})
