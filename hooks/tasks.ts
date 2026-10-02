import type { Task, TaskStatus, When } from '../types'
import type { Files } from './io'
import { dayOf, nextSprint, sprintStart } from './sprints'
import type { SprintConfig } from './sprints'

export const TASKS_DIR = '.claude/manager/tasks'

const FIELDS = ['id', 'title', 'sprint', 'urgent', 'status', 'owner', 'rolled', 'created'] as const
const STATUSES: readonly TaskStatus[] = ['todo', 'doing', 'done', 'cancelled']

// ---- Pure: one task file ----

export function parseTask(text: string, file: string): Task {
  const [, head = '', body = ''] = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/) ?? []
  const field = (name: string) => head.match(new RegExp(`^${name}:[ \\t]*(.*)$`, 'm'))?.[1]?.trim() ?? ''
  const status = field('status') as TaskStatus
  return {
    id: field('id'),
    title: field('title'),
    sprint: field('sprint') || 'backlog',
    urgent: field('urgent') === 'true',
    status: STATUSES.includes(status) ? status : 'todo',
    owner: field('owner'),
    rolled: Number(field('rolled')) || 0,
    created: field('created'),
    file,
    body,
  }
}

export function formatTask(task: Task): string {
  const head = FIELDS.map(name => `${name}: ${task[name]}`.trimEnd()).join('\n')
  return `---\n${head}\n---\n${task.body}`
}

export function slugOf(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
}

export function nextId(tasks: readonly Task[]): string {
  const numbers = tasks.map(task => Number(task.id.replace(/^T-/, '')) || 0)
  return `T-${String(Math.max(0, ...numbers) + 1).padStart(3, '0')}`
}

export function isOpen(task: Task): boolean {
  return task.status === 'todo' || task.status === 'doing'
}

/** Where a "when" puts a task: its sprint and whether it is urgent. */
export function placeOf(when: When, today: string, config: SprintConfig): Pick<Task, 'sprint' | 'urgent'> {
  const current = sprintStart(today, config)
  if (when === 'backlog') return { sprint: 'backlog', urgent: false }
  if (when === 'next-sprint') return { sprint: nextSprint(current, config), urgent: false }
  return { sprint: current, urgent: when === 'now' }
}

/** The "when" a task stands at today. */
export function whenOf(task: Task, today: string, config: SprintConfig): When {
  const current = sprintStart(today, config)
  if (task.sprint === 'backlog') return 'backlog'
  if (task.sprint > current) return 'next-sprint'
  return task.urgent ? 'now' : 'this-sprint'
}

export function bodyOf(goal: string): string {
  return `## Goal\n${goal.trim()}\n\n## Notes\n`
}

/** Adds a dated line at the end of the Notes section. */
export function withNote(body: string, day: string, note: string): string {
  const line = `- ${day}: ${note.trim()}\n`
  const start = body.indexOf('## Notes')
  if (start < 0) return `${body.trimEnd()}\n\n## Notes\n${line}`
  const next = body.indexOf('\n## ', start + 1)
  if (next < 0) return `${body.trimEnd()}\n${line}`
  return `${body.slice(0, next).trimEnd()}\n${line}${body.slice(next)}`
}

/** One line per task, for the model. */
export function taskLine(task: Task, today: string, config: SprintConfig): string {
  const parts = [`${task.id} [${task.status}] ${task.title}`, whenOf(task, today, config)]
  if (task.owner) parts.push(`owner ${task.owner}`)
  if (task.rolled > 0) parts.push(`rolled ${task.rolled}x`)
  return parts.join(' · ')
}

// ---- With files: the task files of the session's project ----

export async function tasksDir(files: Files): Promise<string> {
  return `${await files.root()}/${TASKS_DIR}`
}

export async function today(files: Files): Promise<string> {
  return dayOf(await files.now())
}

const byId = (a: Task, b: Task) => a.id.localeCompare(b.id, undefined, { numeric: true })

/** Reads every task file and publishes the list to the pane. */
export async function listTasks(files: Files): Promise<Task[]> {
  const dir = await tasksDir(files)
  const entries = await files.list(dir).catch(() => [])
  const names = entries.filter(entry => entry.kind === 'file' && /^T-\d+.*\.md$/.test(entry.name))
  const tasks = await Promise.all(
    names.map(async entry => parseTask(await files.read(`${dir}/${entry.name}`), `${dir}/${entry.name}`)),
  )
  tasks.sort(byId)
  await files.publishTasks(tasks)
  return tasks
}

export async function findTask(files: Files, id: string): Promise<Task | undefined> {
  return (await listTasks(files)).find(task => task.id.toLowerCase() === id.trim().toLowerCase())
}

/** Writes the task file; the fs.write hook publishes the fresh list. */
export async function saveTask(files: Files, task: Task): Promise<void> {
  await files.write(task.file, formatTask(task))
}

export type NewTask = { title: string; goal: string; when: When }

export async function createTask(files: Files, input: NewTask, config: SprintConfig): Promise<Task> {
  const day = await today(files)
  const id = nextId(await listTasks(files))
  const task: Task = {
    id,
    title: input.title.trim(),
    ...placeOf(input.when, day, config),
    status: 'todo',
    owner: '',
    rolled: 0,
    created: day,
    file: `${await tasksDir(files)}/${id}-${slugOf(input.title)}.md`,
    body: bodyOf(input.goal),
  }
  await saveTask(files, task)
  return task
}
