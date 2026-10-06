import type { AgentInfo, ModelUsage } from 'claude-code'

import type { Activity, CacheStep, Task, Teammate } from '../types'
import { stateWord } from './activity'
import { warmthOf } from './cache'
import type { CacheTtl } from './cache'
import type { Io } from './io'
import { typeOf } from './models'
import { LEVELS, settingsFrom } from './settings'
import type { TeammateModels } from './settings'

// Teammates: who they are, how full their context is, whether their prompt cache is warm, and whom a successor takes over from.

const ENDED = ['completed', 'failed', 'killed']

export const contextTokens = (usage: ModelUsage) =>
  usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens

export const isActive = (mate: Teammate) => !ENDED.includes(mate.status)

export function percentOf(tokens: number | undefined, window: number): number | undefined {
  return tokens === undefined || window <= 0 ? undefined : Math.round((tokens / window) * 100)
}

/** The effort its agent type runs at ("medium" for better-tasks:teammate-normal); undefined for any other type. */
export function effortOf(type: string, models: TeammateModels | undefined): string | undefined {
  const level = LEVELS.find(one => typeOf(one) === type)
  return level && models?.[level].effort
}

export type CacheFacts = { steps: Record<string, CacheStep>; now: number; ttl: CacheTtl }

/** The named agents of the session: context fill, what they do now, and their cache warmth. */
export function teamOf(
  agents: readonly AgentInfo[],
  tokens: Record<string, number>,
  window: number,
  activities: Record<string, Activity> = {},
  cache?: CacheFacts,
  models?: TeammateModels,
): Teammate[] {
  return agents
    .filter(agent => agent.name !== undefined || agent.type === 'teammate')
    .map(agent => {
      const warmth = cache && warmthOf(cache.steps[agent.id], cache.now, cache.ttl)
      return {
        id: agent.id,
        name: agent.name ?? agent.description,
        status: agent.status,
        effort: effortOf(agent.type, models),
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
  const { models } = await settingsFrom(io)
  const team = teamOf(await io.agents(), await io.tokens(), await io.window(), await io.activities(), cache, models)
  await io.publishTeam(team)
  return team
}

/** The teammate a SendMessage `to` names (a name, "name [ref]" or an agent id). */
export function findMate(team: readonly Teammate[], to: string): Teammate | undefined {
  const name = to.replace(/\s*\[.*\]$/, '').trim()
  return team.find(mate => mate.name === name || mate.id === name)
}

/** The teammate a successor ("login-2") takes over from: the newest other one of its area. */
export function predecessorOf(team: readonly Teammate[], name: string): Teammate | undefined {
  const area = areaOf(name)
  if (area === name) return undefined
  return team.findLast(mate => mate.name !== name && areaOf(mate.name) === area)
}

const areaOf = (name: string) => name.replace(/-\d+$/, '')

export const WAITING = 'waiting for your answer'

/** One word for what it does: working, idle (between turns), waiting (for the user's answer), done, stopped, failed. */
export function stateOf(mate: Teammate): string {
  if (mate.activity === WAITING) return 'waiting'
  if (mate.status !== 'running') return stateWord(mate.status)
  return mate.activity ? 'working' : 'idle'
}

export function cacheText(mate: Teammate): string | undefined {
  if (mate.cache === 'warm') return `cache warm ${mate.cacheMinutesLeft}m`
  return mate.cache === 'cold' ? 'cache cold' : undefined
}

/** A teammate's current task before the ones queued for it. */
export const doingFirst = (a: Task, b: Task) => Number(b.status === 'doing') - Number(a.status === 'doing')

/** Why a spawn named `name` would pass the team's limit, naming who is there and what each owns; undefined if it may go. */
export function overLimit(team: readonly Teammate[], name: string, max: number, tasks: readonly Task[]): string | undefined {
  const alive = team.filter(isActive)
  if (max <= 0 || alive.length < max || alive.some(mate => mate.name === name)) return undefined
  const owned = (mate: Teammate) => tasks.filter(task => task.owner === mate.name).sort(doingFirst).map(task => task.id)
  const list = alive.map(mate => [mate.name, ...owned(mate)].join(' ')).join(', ')
  return `The team is at its limit of ${max} teammates (${list}). Give the task to the owner of similar work, ` +
    'queued after its current one (task_update owner, then SendMessage), or wait until one finishes.'
}

/** Minutes of cache left at which a waiting teammate is flagged: inside one status check's gap. */
export const EXPIRES_SOON = 10

/** A teammate that waits, warm but about to go cold: the lead acts on it now, or sends it a note. */
export function expiresSoon(mate: Teammate): boolean {
  const waits = ['idle', 'waiting'].includes(stateOf(mate))
  return waits && mate.cache === 'warm' && (mate.cacheMinutesLeft ?? 0) <= EXPIRES_SOON
}

export function mateLine(mate: Teammate): string {
  const fill = mate.percent === undefined ? 'context ?' : `context ${mate.percent} %`
  const soon = expiresSoon(mate) ? 'expires soon' : undefined
  return [mate.name, mate.effort, stateOf(mate), fill, cacheText(mate), soon, mate.activity].filter(Boolean).join(' · ')
}
