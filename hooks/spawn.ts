import type { Task } from '../types'
import { isOpen } from './tasks'

// A teammate's spawn reads well in Claude Code's agent list: "Fix login redirect · T-004", not the prompt's first words.

const SUMMARY_TITLE = 40

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The first task id the text names, with this project's prefix ("T-004"). */
export function taskIdIn(text: string, prefix: string): string | undefined {
  return text.match(new RegExp(`(?<![\\w-])${escape(prefix)}\\d+\\b`))?.[0]
}

/** The tasks a question is about: every id on its first line before a colon ("T-4, T-5 (#7): ..." for a bundle's PR), else the first it names. */
export function questionTasks(text: string, prefix: string): string[] {
  const opening = text.split('\n')[0]!.split(':')[0]!
  const ids = opening.match(new RegExp(`(?<![\\w-])${escape(prefix)}\\d+\\b`, 'g'))
  const first = taskIdIn(text, prefix)
  return ids ? [...new Set(ids)] : first ? [first] : []
}

/** The task a spawn is for: the id its prompt names, else the one open task its name owns. */
export function spawnTask(tasks: readonly Task[], prompt: string, name: string, prefix: string): Task | undefined {
  const id = taskIdIn(prompt, prefix)
  if (id) return tasks.find(task => task.id === id)
  const owned = tasks.filter(task => isOpen(task) && task.owner === name)
  return owned.length === 1 ? owned[0] : undefined
}

/** "Fix login redirect · T-004": the title, cut to about 40 characters, and the id. */
export function summaryOf(task: Task): string {
  const title = task.title.length > SUMMARY_TITLE ? `${task.title.slice(0, SUMMARY_TITLE - 1).trimEnd()}…` : task.title
  return `${title} · ${task.id}`
}

/** The spawn's description and first prompt line become the summary; the rest of the prompt follows. */
export function withSummary(spawn: { description: string; prompt: string }, task: Task): { description: string; prompt: string } {
  const summary = summaryOf(task)
  const prompt = spawn.prompt.startsWith(summary) ? spawn.prompt : `${summary}\n\n${spawn.prompt}`
  return { description: summary, prompt }
}
