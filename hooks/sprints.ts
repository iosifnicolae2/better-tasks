// Sprint dates. A day is a "YYYY-MM-DD" string; all math is in UTC days.

export type SprintConfig = {
  weeks: 1 | 2
  /** 0 = Sunday … 6 = Saturday. */
  startDay: number
}

const DAY = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const toMs = (day: string) => Date.parse(`${day}T00:00:00Z`)
const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function addDays(day: string, days: number): string {
  return toDay(toMs(day) + days * DAY)
}

/** The local calendar day of a clock reading. */
export function dayOf(ms: number): string {
  const d = new Date(ms)
  return toDay(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

/** The start day of the sprint that holds `day`. */
export function sprintStart(day: string, config: SprintConfig): string {
  const length = 7 * config.weeks
  const anchor = firstWeekday(config.startDay)
  const days = Math.round((toMs(day) - anchor) / DAY)
  return toDay(anchor + Math.floor(days / length) * length * DAY)
}

export function nextSprint(start: string, config: SprintConfig): string {
  return addDays(start, 7 * config.weeks)
}

export function sprintEnd(start: string, config: SprintConfig): string {
  return addDays(start, 7 * config.weeks - 1)
}

/** The ISO week number of the sprint's first day. */
export function sprintNumber(start: string): number {
  const ms = toMs(start)
  const weekday = (new Date(ms).getUTCDay() + 6) % 7
  const thursday = ms + (3 - weekday) * DAY
  const yearStart = Date.UTC(new Date(thursday).getUTCFullYear(), 0, 1)
  return Math.floor((thursday - yearStart) / DAY / 7) + 1
}

/** "Sprint 41 · Oct 5–11", or "Sprint 40 · Sep 28–Oct 4". */
export function sprintLabel(start: string, config: SprintConfig): string {
  const end = sprintEnd(start, config)
  const [, startMonth, startDate] = parts(start)
  const [, endMonth, endDate] = parts(end)
  const tail = endMonth === startMonth ? `${endDate}` : `${MONTHS[endMonth]} ${endDate}`
  return `Sprint ${sprintNumber(start)} · ${MONTHS[startMonth]} ${startDate}–${tail}`
}

function parts(day: string): [number, number, number] {
  const d = new Date(toMs(day))
  return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]
}

/** The first day from 1970-01-01 on that falls on `weekday`. */
function firstWeekday(weekday: number): number {
  const thursday = 4
  return ((weekday - thursday + 7) % 7) * DAY
}
