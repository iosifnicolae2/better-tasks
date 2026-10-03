// Sprint dates. A day is a "YYYY-MM-DD" string; all math is in UTC days.

export type SprintConfig = {
  /** 1 to 4. */
  weeks: number
  /** 0 = Sunday … 6 = Saturday. */
  startDay: number
}

const DAY = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

/** The ISO week number of a day (weeks start on Monday; week 1 holds the year's first Thursday). */
export function weekNumber(day: string): number {
  const ms = toMs(day)
  const weekday = (new Date(ms).getUTCDay() + 6) % 7
  const thursday = ms + (3 - weekday) * DAY
  const yearStart = Date.UTC(new Date(thursday).getUTCFullYear(), 0, 1)
  return Math.floor((thursday - yearStart) / DAY / 7) + 1
}

/** The ISO weeks a sprint covers, one per week of it (each counted from its fourth day). */
export function sprintWeeks(start: string, config: SprintConfig): number[] {
  return Array.from({ length: config.weeks }, (_, week) => weekNumber(addDays(start, 3 + 7 * week)))
}

/** The sprint's number: its week for weekly sprints, else counted in sprint lengths through the year. */
export function sprintNumber(start: string, config: SprintConfig = { weeks: 1, startDay: 1 }): number {
  return Math.ceil((sprintWeeks(start, config)[0] ?? 1) / config.weeks)
}

/** "Week 41", or "Weeks 41–42". */
export function weekLabel(start: string, config: SprintConfig): string {
  const weeks = sprintWeeks(start, config)
  return weeks.length === 1 ? `Week ${weeks[0]}` : `Weeks ${weeks[0]}–${weeks.at(-1)}`
}

/** "Mon Oct 5 – Sun Oct 11". */
export function datesLabel(start: string, config: SprintConfig): string {
  return `${dateLabel(start)} – ${dateLabel(sprintEnd(start, config))}`
}

/** Days left in the sprint, today included. */
export function daysLeft(today: string, start: string, config: SprintConfig): number {
  return Math.round((toMs(sprintEnd(start, config)) - toMs(today)) / DAY) + 1
}

/** "3 days left", "1 day left" … "last day". */
export function daysLeftLabel(today: string, start: string, config: SprintConfig): string {
  const left = daysLeft(today, start, config)
  return left <= 1 ? 'last day' : `${left} days left`
}

/** "Sprint 41 · Week 41 · Mon Oct 5 – Sun Oct 11". */
export function sprintLabel(start: string, config: SprintConfig): string {
  return `Sprint ${sprintNumber(start, config)} · ${weekLabel(start, config)} · ${datesLabel(start, config)}`
}

/** The label with the days left: "Sprint 41 · Week 41 · Mon Oct 5 – Sun Oct 11 · 3 days left". */
export function sprintTitle(start: string, config: SprintConfig, today: string): string {
  return `${sprintLabel(start, config)} · ${daysLeftLabel(today, start, config)}`
}

function dateLabel(day: string): string {
  const [, month, date] = parts(day)
  return `${WEEKDAYS[new Date(toMs(day)).getUTCDay()]} ${MONTHS[month]} ${date}`
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
