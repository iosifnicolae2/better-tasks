import { describe, expect, test } from 'claude-code/testing'

import { subagentTtl, trustedMinutes, warmthOf } from '../hooks/cache'

const MINUTE = 60_000
const step = (minutesAgo: number, read = 1000, created = 0) => ({ at: 100 * MINUTE - minutesAgo * MINUTE, read, created })
const NOW = 100 * MINUTE

describe('cache warmth', () => {
  test('warm: a recent request that used the cache, with the minutes it is still trusted', () => {
    expect(warmthOf(step(14), NOW, '1h')).toEqual({ cache: 'warm', minutesLeft: 41 })
    expect(warmthOf(step(1, 0, 5000), NOW, '1h')).toEqual({ cache: 'warm', minutesLeft: 54 })
    expect(warmthOf(step(2), NOW, '5m')).toEqual({ cache: 'warm', minutesLeft: 2 })
  })

  test('cold by time: past the TTL less its margin', () => {
    expect(trustedMinutes('1h')).toBe(55)
    expect(warmthOf(step(55), NOW, '1h')).toEqual({ cache: 'cold', minutesLeft: 0 })
    expect(warmthOf(step(4), NOW, '5m')).toEqual({ cache: 'cold', minutesLeft: 0 })
  })

  test('cold when the last request neither read nor wrote the cache', () => {
    expect(warmthOf(step(1, 0, 0), NOW, '1h')).toEqual({ cache: 'cold', minutesLeft: 0 })
  })

  test('unknown before the first request', () => {
    expect(warmthOf(undefined, NOW, '1h')).toBeUndefined()
  })
})

describe('the TTL teammates get, in Claude Code\'s order', () => {
  test('force 5m > env > setting > ENABLE_PROMPT_CACHING_1H > 5m', () => {
    expect(subagentTtl({})).toBe('5m')
    expect(subagentTtl({ oneHourEnv: '1' })).toBe('1h')
    expect(subagentTtl({ subagentSetting: '5m', oneHourEnv: '1' })).toBe('5m')
    expect(subagentTtl({ subagentEnv: '1h', subagentSetting: '5m' })).toBe('1h')
    expect(subagentTtl({ subagentEnv: 'forever' as string, subagentSetting: '1h' })).toBe('1h')
    expect(subagentTtl({ subagentEnv: '1h', force5mEnv: '1' })).toBe('5m')
  })
})
