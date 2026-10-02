import type { Task } from '../types'
import type { Files } from './io'
import { settingsFrom } from './settings'

// sprints.md (path: settings.paths.sprints): one "## <start> · <label>" section per sprint, its goal and review.

const HEADER = '# Sprints\nOne section per sprint: its goal, then the review written when it ends.\n'

type Split = { before: string; section: string; after: string }

function split(text: string, start: string): Split | undefined {
  const at = text.search(new RegExp(`^## ${start}\\b`, 'm'))
  if (at < 0) return undefined
  const next = text.indexOf('\n## ', at + 1)
  const end = next < 0 ? text.length : next + 1
  return { before: text.slice(0, at), section: text.slice(at, end), after: text.slice(end) }
}

function withSection(text: string, start: string, label: string, change: (section: string) => string): string {
  const found = split(text, start)
  if (found) return found.before + change(found.section) + found.after
  const base = text.trim() ? `${text.trimEnd()}\n\n` : `${HEADER}\n`
  return base + change(`## ${start} · ${label}\n`)
}

export function goalOf(text: string, start: string): string {
  return split(text, start)?.section.match(/^Goal: (.*)$/m)?.[1]?.trim() ?? ''
}

export function withGoal(text: string, start: string, label: string, goal: string): string {
  const line = `Goal: ${goal.trim()}`
  return withSection(text, start, label, section =>
    /^Goal: /m.test(section)
      ? section.replace(/^Goal: .*$/m, line)
      : section.replace(/\n/, `\n${line}\n`),
  )
}

export type Review = { shipped: readonly Task[]; rolled: readonly Task[] }

export function withReview(text: string, start: string, label: string, review: Review): string {
  const list = (tasks: readonly Task[]) =>
    tasks.length === 0 ? '- none\n' : tasks.map(task => `- ${task.id} ${task.title}\n`).join('')
  const block = `\n### Review\nShipped:\n${list(review.shipped)}Rolled over:\n${list(review.rolled)}`
  return withSection(text, start, label, section => `${section.trimEnd()}\n${block}`)
}

async function sprintsPath(files: Files): Promise<string> {
  return `${await files.root()}/${(await settingsFrom(files)).paths.sprints}`
}

export async function readSprints(files: Files): Promise<string> {
  return files.read(await sprintsPath(files)).catch(() => '')
}

export async function writeSprints(files: Files, text: string): Promise<void> {
  await files.write(await sprintsPath(files), text)
}
