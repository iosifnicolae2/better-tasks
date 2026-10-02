import type { PromptComposeSection, PromptComposeTrait, PromptOrigin } from 'claude-code'

import type { Task, TurnFacts } from '../types'
import type { Io } from './io'
import type { Settings } from './settings'
import { goalOf, readSprints } from './sprintlog'
import { sprintLabel, sprintNumber, sprintStart } from './sprints'
import { isOpen, listTasks, today } from './tasks'
import { isActive, isFull, mateLine, refreshTeam } from './team'

// The main session as coordinator: its rules, a small context block per prompt, the task_create guard.

export const RULES = `# Supermanager: you are the coordinator
You route work to agent teammates; you don't do the work yourself unless it is a one-line answer.
- Every user message is routed: if a teammate already owns that area (files, feature, question), forward it with SendMessage, word for word plus missing context. New work → a task, then a teammate named by its area.
- One owner per set of files. Similar work goes to the same teammate, even a stopped one (SendMessage resumes it).
- Check team_status before routing. A teammate over the context limit gets no new work: ask it for a handoff note in its task file, stop it, spawn a fresh one with the task file.
- Creating a task never starts it. Unless the user already said when, ask with AskUserQuestion: Now / This sprint / Next sprint / Backlog. Then task_create.
- "Now" → start it at once (route or spawn). This-sprint tasks are worked in order once the user says go.
- Sprints are weekly (Linear-style): one sprint goal; inbox → backlog → sprint; unfinished work rolls over. Keep the goal in mind and flag tasks that don't serve it.
- Plan first only when the user asks: then spawn the teammate in plan mode and approve its plan.
- Give each teammate its task file path; it keeps notes there. When it is done, task_update status done with a summary and the commits.
- Tell the user in one line where each message went.
- The user's sprint board is /supermanager (settings: /supermanager config); /away turns the screens off.`

const RULES_SECTION: PromptComposeSection = { id: 'supermanager:coordinator', text: RULES, scope: 'session' }

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

/** The system prompt with the coordinator rules, added only to the main session's. */
export function withRules(
  sections: readonly PromptComposeSection[],
  traits: readonly PromptComposeTrait[],
  tools: readonly string[],
): readonly PromptComposeSection[] {
  return isMainPrompt(sections, traits, tools) ? [...sections, RULES_SECTION] : sections
}

/** Why the main session may not create a task yet, or undefined when it may. */
export function createDenial(facts: TurnFacts, agentId: string | undefined): string | undefined {
  if (agentId !== undefined || facts.asked || facts.namedTime) return undefined
  return 'Ask the user when first: AskUserQuestion with Now / This sprint / Next sprint / Backlog, then call task_create again.'
}

/** What the coordinator reads beside each user prompt: sprint, due work, notice, teammates. */
export async function contextBlock(io: Io, settings: Settings, notice: string): Promise<string> {
  const config = settings.sprint
  const start = sprintStart(await today(io), config)
  const tasks = (await listTasks(io)).filter(task => task.sprint === start)
  const team = (await refreshTeam(io)).filter(isActive)
  const goal = goalOf(await readSprints(io), start)
  const done = tasks.filter(task => task.status === 'done').length
  const lines = [
    `[supermanager] ${sprintLabel(start, config)} · goal: ${goal || 'not set'} · ${done}/${tasks.length} done`,
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
  return [`Due now, not started: ${list}. Remind the user and ask whether to start.`]
}

/** The footer label: "Sprint 41 · 1/4 done", plus " · 1 due" when a now-task waits. Teammates are Claude Code's to show. */
export function footerText(tasks: readonly Task[], start: string): string {
  const sprint = tasks.filter(task => task.sprint === start)
  const done = sprint.filter(task => task.status === 'done').length
  const due = sprint.filter(task => task.urgent && isOpen(task)).length
  return `Sprint ${sprintNumber(start)} · ${done}/${sprint.length} done${due > 0 ? ` · ${due} due` : ''}`
}
