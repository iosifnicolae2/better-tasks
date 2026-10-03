import type { CacheStep } from '../types'

// Prompt-cache warmth of a teammate, measured from its last model request.
// The cache lives TTL minutes after its last read or write; a request in time reads it and starts the clock again.

export type CacheTtl = '5m' | '1h'

type TtlSources = {
  /** CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL */
  subagentEnv?: string
  /** The subagentPromptCacheTtl setting. */
  subagentSetting?: unknown
  /** ENABLE_PROMPT_CACHING_1H */
  oneHourEnv?: string
  /** FORCE_PROMPT_CACHING_5M */
  force5mEnv?: string
}

const isTtl = (value: unknown): value is CacheTtl => value === '5m' || value === '1h'

/** The TTL Claude Code uses for requests outside the main conversation (teammates, subagents), in its own order. */
export function subagentTtl(sources: TtlSources): CacheTtl {
  if (sources.force5mEnv === '1') return '5m'
  if (isTtl(sources.subagentEnv)) return sources.subagentEnv
  if (isTtl(sources.subagentSetting)) return sources.subagentSetting
  return sources.oneHourEnv === '1' ? '1h' : '5m'
}

const MINUTE = 60_000

/** Minutes a cache is trusted: the TTL less a margin, so a request planned now still lands in time. */
export function trustedMinutes(ttl: CacheTtl): number {
  return ttl === '1h' ? 55 : 4
}

export type Warmth = { cache: 'warm' | 'cold'; minutesLeft: number }

/** Warm while the last request is younger than the trusted minutes and it used the cache; undefined before any request. */
export function warmthOf(step: CacheStep | undefined, now: number, ttl: CacheTtl): Warmth | undefined {
  if (step === undefined) return undefined
  const left = Math.floor(trustedMinutes(ttl) - (now - step.at) / MINUTE)
  const usedCache = step.read + step.created > 0
  return left > 0 && usedCache ? { cache: 'warm', minutesLeft: left } : { cache: 'cold', minutesLeft: 0 }
}
