import type { StatusCheck, Task, Teammate } from '../types'

// The status check: after a quiet spell, the coordinator is asked to move the open work forward.

const MAX_MINUTES = 60
const MINUTE = 60_000

export const NO_CHECK: StatusCheck = { activeAt: 0, checkedAt: 0, fingerprint: '', quiet: 0, busy: false }

/** Minutes to wait: the setting, doubled from the second quiet check on, at most an hour. */
export function waitMinutes(every: number, quiet: number): number {
  return Math.min(MAX_MINUTES, every * 2 ** Math.max(0, quiet - 1))
}

/** The open work, the teammates and the tasks resolved but still open, as one comparable string: a change means there is something new to look at. */
export function fingerprintOf(tasks: readonly Task[], team: readonly Teammate[], unclosed: readonly string[] = []): string {
  const work = tasks.map(task => `${task.id}:${task.status}:${task.owner}:${task.body.length}`)
  const mates = team.map(mate => `${mate.name}:${mate.status}:${mate.activity ?? ''}`)
  return [...work, ...mates, ...unclosed.map(id => `resolved:${id}`)].join('|')
}

export type StatusFacts = {
  now: number
  every: number
  check: StatusCheck
  hasWork: boolean
  composerText: string
  fingerprint: string
}

/** Whether to ask for a status check now, and the check record afterwards. */
export function statusDecision(facts: StatusFacts): { fire: boolean; check: StatusCheck } {
  const { now, every, check } = facts
  const isBlocked = every <= 0 || check.busy || facts.composerText.trim() !== '' || !facts.hasWork
  const idleSince = Math.max(check.activeAt, check.checkedAt)
  if (isBlocked || now - idleSince < waitMinutes(every, check.quiet) * MINUTE) return { fire: false, check }
  if (facts.fingerprint === check.fingerprint) return { fire: false, check: { ...check, checkedAt: now, quiet: check.quiet + 1 } }
  return { fire: true, check: { ...check, checkedAt: now, quiet: 0, fingerprint: facts.fingerprint } }
}
