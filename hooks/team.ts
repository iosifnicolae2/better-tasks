import type { AgentInfo, ModelUsage } from 'claude-code'

import type { Activity, CacheStep, Teammate } from '../types'
import { warmthOf } from './cache'
import type { CacheTtl } from './cache'
import type { Io } from './io'

// Teammates: who they are, how full their context is, whether their prompt cache is warm, and when they take no new work.

const ENDED = ['completed', 'failed', 'killed']

export const contextTokens = (usage: ModelUsage) =>
  usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens

export const isActive = (mate: Teammate) => !ENDED.includes(mate.status)

export const isFull = (mate: Teammate, limit: number) => mate.percent !== undefined && mate.percent > limit

export function percentOf(tokens: number | undefined, window: number): number | undefined {
  return tokens === undefined || window <= 0 ? undefined : Math.round((tokens / window) * 100)
}

export type CacheFacts = { steps: Record<string, CacheStep>; now: number; ttl: CacheTtl }

/** The named agents of the session: context fill, what they do now, and their cache warmth. */
export function teamOf(
  agents: readonly AgentInfo[],
  tokens: Record<string, number>,
  window: number,
  activities: Record<string, Activity> = {},
  cache?: CacheFacts,
): Teammate[] {
  return agents
    .filter(agent => agent.name !== undefined || agent.type === 'teammate')
    .map(agent => {
      const warmth = cache && warmthOf(cache.steps[agent.id], cache.now, cache.ttl)
      return {
        id: agent.id,
        name: agent.name ?? agent.description,
        status: agent.status,
        percent: percentOf(tokens[agent.id], window),
        activity: activities[agent.id]?.text,
        activeAt: activities[agent.id]?.at,
        cache: warmth?.cache,
        cacheMinutesLeft: warmth?.minutesLeft,
      }
    })
}

export async function refreshTeam(io: Io): Promise<Teammate[]> {
  const cache = { steps: await io.cacheSteps(), now: await io.now(), ttl: await io.cacheTtl() }
  const team = teamOf(await io.agents(), await io.tokens(), await io.window(), await io.activities(), cache)
  await io.publishTeam(team)
  return team
}

/** The teammate a SendMessage `to` names (a name, "name [ref]" or an agent id). */
export function findMate(team: readonly Teammate[], to: string): Teammate | undefined {
  const name = to.replace(/\s*\[.*\]$/, '').trim()
  return team.find(mate => mate.name === name || mate.id === name)
}

export type Block = 'cold' | 'full'

/** Why a teammate takes no new work: its cache went cold, or its context is over the limit. */
export function blockOf(mate: Teammate, limit: number): Block | undefined {
  if (mate.cache === 'cold') return 'cold'
  return isFull(mate, limit) ? 'full' : undefined
}

/** The teammate a plain message to `to` must not reach, and why. HANDOFF: notes and protocol messages always pass. */
export function sendBlock(
  team: readonly Teammate[],
  to: string,
  message: unknown,
  limit: number,
): { mate: Teammate; block: Block } | undefined {
  if (typeof message !== 'string' || message.trimStart().startsWith('HANDOFF:')) return undefined
  const mate = findMate(team, to)
  const block = mate && blockOf(mate, limit)
  return mate && block ? { mate, block } : undefined
}

/** What the coordinator does instead: a fresh teammate for the area, pointed at the old one's transcript. */
export function blockAdvice(mate: Teammate, block: Block, limit: number, transcript: string): string {
  const fresh =
    `Spawn a fresh teammate for the same area (e.g. "${mate.name}-2") with the task file and its predecessor's ` +
    `transcript to search for what it needs: ${transcript}. It picks up and finishes the task. Stop ${mate.name} once the new one confirms.`
  if (block === 'cold') {
    return `${mate.name}'s prompt cache is cold, so a message would pay to load its whole context again. Don't send it new work. ${fresh}`
  }
  return (
    `${mate.name} is at ${mate.percent} % context (limit ${limit} %). Don't give it new work. ` +
    `First ask it for a handoff note in its task file (a message starting with "HANDOFF:"). ${fresh}`
  )
}

/** "idle" for a running teammate between turns, "working" during one. */
export function stateOf(mate: Teammate): string {
  if (mate.status !== 'running') return mate.status
  return mate.activity ? 'working' : 'idle'
}

export function cacheText(mate: Teammate): string | undefined {
  if (mate.cache === 'warm') return `cache warm ${mate.cacheMinutesLeft}m`
  return mate.cache === 'cold' ? 'cache cold' : undefined
}

export function mateLine(mate: Teammate): string {
  const fill = mate.percent === undefined ? 'context ?' : `context ${mate.percent} %`
  return [mate.name, stateOf(mate), fill, cacheText(mate), mate.activity].filter(Boolean).join(' · ')
}
