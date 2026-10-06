import type { PromptComposeSection, PromptComposeTrait, PromptOrigin } from 'claude-code'

import type { Task, TurnFacts } from '../types'
import type { Io } from './io'
import type { Settings } from './settings'
import { taskIdIn } from './spawn'
import { goalOf, readSprints } from './sprintlog'
import { sprintNumber, sprintStart, sprintTitle } from './sprints'
import type { SprintConfig } from './sprints'
import { isBlocked, isOpen, labelsText, listTasks, taskRef, today, waitsText, WHEN_LABELS, whenOf } from './tasks'
import { isActive, mateLine, refreshTeam } from './team'

// The main session as coordinator: its rules and a small context block per prompt.

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
  return [...sections, { id: 'better-tasks:coordinator', text: rules, scope: 'session' }]
}

/** What the coordinator reads beside each user prompt: sprint, due work, notice, teammates. */
export async function contextBlock(io: Io, settings: Settings, notice: string): Promise<string> {
  const config = settings.sprint
  const day = await today(io)
  const start = sprintStart(day, config)
  const all = await listTasks(io)
  const tasks = all.filter(task => task.sprint === start)
  const team = (await refreshTeam(io)).filter(isActive)
  const goal = goalOf(await readSprints(io), start)
  const done = tasks.filter(task => task.status === 'done').length
  const lines = [
    `[better-tasks] ${sprintTitle(start, config, day)} · goal: ${goal || 'not set'} · ${done}/${tasks.length} done`,
    ...waitingLines(tasks, all),
    ...openTaskLines(all, day, config),
    notice,
    ...team.map(mate => `Teammate ${mateLine(mate)}`),
  ]
  return lines.filter(Boolean).join('\n')
}

const OTHERS_SHOWN = 10

/** The open tasks the user's message may refer to: currently working on and this sprint, then the 10 newest others. */
export function openTaskLines(tasks: readonly Task[], day: string, config: SprintConfig): string[] {
  const open = tasks.filter(isOpen)
  const isNear = (task: Task) => ['now', 'this-sprint'].includes(whenOf(task, day, config))
  const newest = (a: Task, b: Task) => b.created.localeCompare(a.created) || b.id.localeCompare(a.id, undefined, { numeric: true })
  const shown = [...open.filter(isNear), ...open.filter(task => !isNear(task)).sort(newest).slice(0, OTHERS_SHOWN)]
  if (shown.length === 0) return []
  const line = (task: Task) =>
    [`- ${taskRef(task)} ${task.title}`, WHEN_LABELS[whenOf(task, day, config)], task.owner, labelsText(task), waitsText(task, tasks)].filter(Boolean).join(' · ')
  const hidden = open.length - shown.length
  return ['Open tasks (match the message against these):', ...shown.map(line), ...(hidden > 0 ? [`- … ${hidden} more: task_list`] : [])]
}

const QUESTION = /^\s*(what|which|who|where|when|why|how|is|are|was|were|does|do|did|show|list)\b|\?\s*$/i

/** A message that reads as a question: answered, not filed. */
export const isQuestion = (text: string) => QUESTION.test(text)

/** One gentle line when the last message was neither filed, nor a question, nor answered with a question back. */
export function unfiledLine(last: TurnFacts): string | undefined {
  if (!last.prompted || last.filed || last.asked || last.question) return undefined
  return 'Your last message was not filed. If it was work or an observation, file it: task_create, or task_note on the task it refers to.'
}

/** The Finishing question's option that closes a task (texts.ts). */
export const RESOLVE_OPTION = 'Mark as resolved'

/** The task ids an AskUserQuestion answer resolved: each question naming a task, answered "Mark as resolved". */
export function resolvedIn(answers: unknown, prefix: string): string[] {
  if (!answers || typeof answers !== 'object') return []
  return Object.entries(answers)
    .filter(([, answer]) => answer === RESOLVE_OPTION)
    .map(([question]) => taskIdIn(question, prefix))
    .filter((id): id is string => id !== undefined)
}

/** One line while a task the user resolved is still open: the lead closes it now. */
export function unclosedLine(ids: readonly string[]): string {
  if (ids.length === 0) return ''
  return (
    `The user marked ${ids.join(', ')} resolved, still open: close each now (task_update status done with a one-line ` +
    'summary and the commits from the task file; its full tests still running: once they pass), then stop its teammate.'
  )
}

/** The currently-working-on tasks not started yet: route the ones free to start; the blocked ones wait for their dependencies. */
function waitingLines(tasks: readonly Task[], all: readonly Task[]): string[] {
  const waiting = tasks.filter(task => task.urgent && task.status === 'todo')
  const named = (task: Task) => `${taskRef(task)} ${task.title}`
  const ready = waiting.filter(task => !isBlocked(task, all)).map(named)
  const held = waiting.filter(task => isBlocked(task, all)).map(task => `${named(task)} (${waitsText(task, all)})`)
  return [
    ready.length > 0 ? `Currently working on, not started yet: ${ready.join('; ')}. Route each now: its owner or a new teammate.` : '',
    held.length > 0 ? `Blocked, not started: ${held.join('; ')}. Start each once its dependencies are done.` : '',
  ].filter(Boolean)
}

/** The footer label: "Sprint 41 · 1/4 done", plus " · 1 due" when a currently-working-on task waits. Teammates are Claude Code's to show. */
export function footerText(tasks: readonly Task[], start: string, config: SprintConfig): string {
  const sprint = tasks.filter(task => task.sprint === start)
  const done = sprint.filter(task => task.status === 'done').length
  const due = sprint.filter(task => task.urgent && isOpen(task)).length
  return `Sprint ${sprintNumber(start, config)} · ${done}/${sprint.length} done${due > 0 ? ` · ${due} due` : ''}`
}
