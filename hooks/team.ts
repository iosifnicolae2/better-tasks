import { read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, On } from 'claude-code'

import type { Teammate } from '../types'
import type { Settings } from './settings'
import { teamState, tokensState } from './state'

// Teammates: who they are, how full their context is, and the guard that keeps work off full ones.

const ENDED = ['completed', 'failed', 'killed']

export const contextTokens = (usage: ModelUsage) =>
  usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens

export const isActive = (mate: Teammate) => !ENDED.includes(mate.status)

export function percentOf(tokens: number | undefined, window: number): number | undefined {
  return tokens === undefined || window <= 0 ? undefined : Math.round((tokens / window) * 100)
}

/** Reads the session's named agents and publishes them with their context fill. */
export async function refreshTeam($: EngineInterface): Promise<Teammate[]> {
  const agents = await $.agent.list()
  const tokens = await read($, tokensState)
  const { window } = (await $.session.usage()).context
  const team = agents
    .filter(agent => agent.name !== undefined || agent.type === 'teammate')
    .map(agent => ({
      id: agent.id,
      name: agent.name ?? agent.description,
      status: agent.status,
      percent: percentOf(tokens[agent.id], window),
    }))
  await update($, teamState, () => team)
  return team
}

export function findMate(team: readonly Teammate[], to: string): Teammate | undefined {
  const name = to.replace(/\s*\[.*\]$/, '').trim()
  return team.find(mate => mate.name === name || mate.id === name)
}

export function handoffAdvice(mate: Teammate, limit: number): string {
  return (
    `${mate.name} is at ${mate.percent} % context (limit ${limit} %). Don't give it new work. ` +
    'Ask it for a handoff note in its task file (start the message with "HANDOFF:"), ' +
    'then stop it and spawn a fresh teammate with the task file.'
  )
}

export function mateLine(mate: Teammate): string {
  const fill = mate.percent === undefined ? 'context ?' : `context ${mate.percent} %`
  return `${mate.name} · ${mate.status} · ${fill}`
}

export function registerTeam(on: On, settings: Settings): void {
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const agentId = e.agentId
    if (agentId !== undefined && result.usage) {
      const tokens = contextTokens(result.usage)
      await update($, tokensState, all => ({ ...all, [agentId]: tokens }))
      await refreshTeam($)
    }
    return result
  })

  on('tool.call', { tool: 'SendMessage' }, async ($, e, next) => {
    const isPlainWork = typeof e.message === 'string' && !e.message.trimStart().startsWith('HANDOFF:')
    if (!isPlainWork) return next(e)
    const mate = findMate(await refreshTeam($), String(e.to))
    const isFull = mate?.percent !== undefined && mate.percent > settings.contextLimit
    return mate && isFull ? { deny: handoffAdvice(mate, settings.contextLimit) } : next(e)
  })
}
