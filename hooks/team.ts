import type { AgentInfo, ModelUsage } from 'claude-code'

import type { Teammate } from '../types'
import type { Io } from './io'

// Teammates: who they are, how full their context is, and when they are too full for new work.

const ENDED = ['completed', 'failed', 'killed']

export const contextTokens = (usage: ModelUsage) =>
  usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens

export const isActive = (mate: Teammate) => !ENDED.includes(mate.status)

export const isFull = (mate: Teammate, limit: number) => mate.percent !== undefined && mate.percent > limit

export function percentOf(tokens: number | undefined, window: number): number | undefined {
  return tokens === undefined || window <= 0 ? undefined : Math.round((tokens / window) * 100)
}

/** The named agents of the session, with their context fill. */
export function teamOf(agents: readonly AgentInfo[], tokens: Record<string, number>, window: number): Teammate[] {
  return agents
    .filter(agent => agent.name !== undefined || agent.type === 'teammate')
    .map(agent => ({
      id: agent.id,
      name: agent.name ?? agent.description,
      status: agent.status,
      percent: percentOf(tokens[agent.id], window),
    }))
}

export async function refreshTeam(io: Io): Promise<Teammate[]> {
  const team = teamOf(await io.agents(), await io.tokens(), await io.window())
  await io.publishTeam(team)
  return team
}

/** The teammate a SendMessage `to` names (a name, "name [ref]" or an agent id). */
export function findMate(team: readonly Teammate[], to: string): Teammate | undefined {
  const name = to.replace(/\s*\[.*\]$/, '').trim()
  return team.find(mate => mate.name === name || mate.id === name)
}

/** Why a message to `to` is refused, or undefined when it may go. */
export function sendDenial(team: readonly Teammate[], to: string, message: unknown, limit: number): string | undefined {
  if (typeof message !== 'string' || message.trimStart().startsWith('HANDOFF:')) return undefined
  const mate = findMate(team, to)
  return mate && isFull(mate, limit) ? handoffAdvice(mate, limit) : undefined
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
