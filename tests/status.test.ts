import { describe, expect, test } from 'claude-code/testing'

import { NO_CHECK, statusDecision, waitMinutes } from '../hooks/status'

const MINUTE = 60_000
const base = { every: 10, hasWork: true, composerText: '', fingerprint: 'a' }

describe('status check decision', () => {
  test('fires after the quiet minutes with work open, and remembers what it saw', () => {
    expect(statusDecision({ ...base, now: 9 * MINUTE, check: NO_CHECK }).fire).toBe(false)
    const fired = statusDecision({ ...base, now: 10 * MINUTE, check: NO_CHECK })
    expect(fired).toEqual({ fire: true, check: { ...NO_CHECK, checkedAt: 10 * MINUTE, fingerprint: 'a' } })
  })

  test('never while busy, with text in the composer, with nothing open, or turned off', () => {
    const now = 30 * MINUTE
    expect(statusDecision({ ...base, now, check: { ...NO_CHECK, busy: true } }).fire).toBe(false)
    expect(statusDecision({ ...base, now, check: NO_CHECK, composerText: 'half a thought' }).fire).toBe(false)
    expect(statusDecision({ ...base, now, check: NO_CHECK, hasWork: false }).fire).toBe(false)
    expect(statusDecision({ ...base, now, check: NO_CHECK, every: 0 }).fire).toBe(false)
  })

  test('nothing changed: skipped and counted; the wait doubles from the second quiet check, up to an hour', () => {
    const seen = { ...NO_CHECK, checkedAt: 10 * MINUTE, fingerprint: 'a' }
    const skipped = statusDecision({ ...base, now: 20 * MINUTE, check: seen })
    expect(skipped).toEqual({ fire: false, check: { ...seen, checkedAt: 20 * MINUTE, quiet: 1 } })
    expect([0, 1, 2, 3, 4, 5].map(quiet => waitMinutes(10, quiet))).toEqual([10, 10, 20, 40, 60, 60])
  })
})
