import type { PromptComposeSection, PromptComposeTrait, PromptOrigin } from 'claude-code'

import type { Task, TurnFacts } from '../types'
import type { Io } from './io'
import type { Settings } from './settings'
import { goalOf, readSprints } from './sprintlog'
import { sprintNumber, sprintStart, sprintTitle } from './sprints'
import type { SprintConfig } from './sprints'
import { isOpen, listTasks, today } from './tasks'
import { isActive, isFull, mateLine, refreshTeam } from './team'

// The main session as coordinator: its rules, a small context block per prompt, the task_create guard.

const TIME_WORDS = /\b(now|right away|asap|urgent|immediately|today|this sprint|next sprint|backlog|later|this week|next week)\b/i

export const namesTime = (text: string) => TIME_WORDS.test(text)

export const isPerson = (origin: PromptOrigin) => ['composer', 'bridge', 'sdk'].includes(origin.kind)

/** The main session's own prompt: the full or short body, the Agent tool, and not a teammate's render. */
export function isMainPrompt(
  sections: readonly PromptComposeSection[],
  traits: readonly PromptComposeTrait[],
  tools: readonly string[],
): boolean {
  const hasMainBody = sections.some(section => section.id === 'intro' || section.id === 'lean_body')
  return hasMainBody && tools.includes('Agent') && !traits.includes('teammate')
}

/** The system prompt with the coordinator rules (texts.ts, or the project's coordinator.md), only in the main session's. */
export function withRules(
  sections: readonly PromptComposeSection[],
  traits: readonly PromptComposeTrait[],
  tools: readonly string[],
  rules: string,
): readonly PromptComposeSection[] {
  if (!isMainPrompt(sections, traits, tools) || rules === '') return sections
  return [...sections, { id: 'supermanager:coordinator', text: rules, scope: 'session' }]
}

/** Why the main session may not create a task yet, or undefined when it may. */
export function createDenial(facts: TurnFacts, agentId: string | undefined): string | undefined {
  if (agentId !== undefined || facts.asked || facts.namedTime) return undefined
  return 'Ask the user when first: AskUserQuestion with "Start now (currently working on)" / This sprint / Next sprint / Backlog, then call task_create again.'
}

/** What the coordinator reads beside each user prompt: sprint, due work, notice, teammates. */
export async function contextBlock(io: Io, settings: Settings, notice: string): Promise<string> {
  const config = settings.sprint
  const day = await today(io)
  const start = sprintStart(day, config)
  const tasks = (await listTasks(io)).filter(task => task.sprint === start)
  const team = (await refreshTeam(io)).filter(isActive)
  const goal = goalOf(await readSprints(io), start)
  const done = tasks.filter(task => task.status === 'done').length
  const lines = [
    `[supermanager] ${sprintTitle(start, config, day)} · goal: ${goal || 'not set'} · ${done}/${tasks.length} done`,
    ...waitingLines(tasks),
    notice,
    ...team.map(mate => `Teammate ${mateLine(mate)}${isFull(mate, settings.contextLimit) ? ' · FULL, no new work' : ''}`),
  ]
  return lines.filter(Boolean).join('\n')
}

function waitingLines(tasks: readonly Task[]): string[] {
  const waiting = tasks.filter(task => task.urgent && task.status === 'todo')
  if (waiting.length === 0) return []
  const list = waiting.map(task => `${task.id} ${task.title}`).join('; ')
  return [`Currently working on, not started yet: ${list}. Remind the user and ask whether to start.`]
}

/** The footer label: "Sprint 41 · 1/4 done", plus " · 1 due" when a currently-working-on task waits. Teammates are Claude Code's to show. */
export function footerText(tasks: readonly Task[], start: string, config: SprintConfig): string {
  const sprint = tasks.filter(task => task.sprint === start)
  const done = sprint.filter(task => task.status === 'done').length
  const due = sprint.filter(task => task.urgent && isOpen(task)).length
  return `Sprint ${sprintNumber(start, config)} · ${done}/${sprint.length} done${due > 0 ? ` · ${due} due` : ''}`
}
