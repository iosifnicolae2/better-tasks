import type { Task, TaskStatus, When } from '../types'
import type { Files } from './io'
import { dayOf, nextSprint, sprintStart } from './sprints'
import type { SprintConfig } from './sprints'
import { settingsFrom, settingsOf } from './settings'
import type { TaskNaming } from './settings'
import { fill, projectText, SHIPPED } from './texts'
import { oneLine, readYamlValue, yamlValue } from './yaml'

const DEFAULT_NAMING = settingsOf({}).tasks

const FIELDS = ['id', 'title', 'sprint', 'urgent', 'status', 'owner', 'rolled', 'order', 'created'] as const
const STATUSES: readonly TaskStatus[] = ['todo', 'doing', 'done', 'cancelled']

// ---- Pure: one task file ----

export function parseTask(text: string, file: string): Task {
  const [, head = '', body = ''] = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/) ?? []
  const field = (name: string) => readYamlValue(head.match(new RegExp(`^${name}:[ \\t]*(.*)$`, 'm'))?.[1] ?? '')
  const status = field('status') as TaskStatus
  return {
    id: field('id'),
    title: field('title'),
    sprint: field('sprint') || 'backlog',
    urgent: field('urgent') === 'true',
    status: STATUSES.includes(status) ? status : 'todo',
    owner: field('owner'),
    rolled: Number(field('rolled')) || 0,
    order: Number(field('order')) || 0,
    created: field('created'),
    dependsOn: idsIn(field('dependsOn')),
    file,
    body,
  }
}

export function formatTask(task: Task): string {
  const value = (name: (typeof FIELDS)[number]) => {
    const raw = task[name]
    return typeof raw === 'string' ? yamlValue(oneLine(raw)) : String(raw)
  }
  const head = FIELDS.map(name => `${name}: ${value(name)}`.trimEnd())
  const ids = dependenciesOf(task)
  if (ids.length > 0) head.push(`dependsOn: [${ids.map(yamlValue).join(', ')}]`)
  return `---\n${head.join('\n')}\n---\n${task.body}`
}

/** The ids a dependsOn value lists: "[T-071, T-072]", or the same without brackets. */
export function idsIn(value: string): string[] {
  return value.replace(/^\[|\]$/g, '').split(',').map(readYamlValue).filter(Boolean)
}

export function slugOf(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
}

/** The id after the highest one with this prefix: T-001, T-002, … (prefix, padding and start are settings). */
export function nextId(tasks: readonly Task[], naming: TaskNaming = DEFAULT_NAMING): string {
  const numbers = tasks
    .filter(task => task.id.startsWith(naming.prefix))
    .map(task => Number(task.id.slice(naming.prefix.length)) || 0)
  const next = Math.max(naming.start - 1, ...numbers) + 1
  return `${naming.prefix}${String(next).padStart(naming.padding, '0')}`
}

export function isOpen(task: Task): boolean {
  return task.status === 'todo' || task.status === 'doing'
}

/** Its dependencies' ids; none for a task kept in state from before the field existed (a plugin update mid-session). */
export const dependenciesOf = (task: Task): readonly string[] => task.dependsOn ?? []

const sameId = (one: string, other: string) => one.trim().toLowerCase() === other.trim().toLowerCase()

/** The task with this id, whatever its case. */
export function taskWithId(tasks: readonly Task[], id: string): Task | undefined {
  return tasks.find(task => sameId(task.id, id))
}

/** The dependencies `task` still waits on: the ones open. A closed (done or cancelled) or deleted one no longer holds it. */
export function blockersOf(task: Task, tasks: readonly Task[]): Task[] {
  return dependenciesOf(task).map(id => taskWithId(tasks, id)).filter((one): one is Task => one !== undefined && isOpen(one))
}

/** A task is blocked while a dependency is open: it isn't started until they are all done. */
export function isBlocked(task: Task, tasks: readonly Task[]): boolean {
  return blockersOf(task, tasks).length > 0
}

/** "waits on T-071 (#39), T-072", or '' when nothing holds the task. */
export function waitsText(task: Task, tasks: readonly Task[]): string {
  const blockers = blockersOf(task, tasks)
  return blockers.length > 0 ? `waits on ${blockers.map(taskRef).join(', ')}` : ''
}

/** Why task `id` can't depend on `ids`: an unknown id, itself, or a cycle. Undefined when it can. */
export function dependencyProblem(id: string, ids: readonly string[], tasks: readonly Task[]): string | undefined {
  const unknown = ids.filter(dep => !taskWithId(tasks, dep))
  if (unknown.length > 0) return `No task ${unknown.join(', ')}: dependsOn takes the ids of existing tasks.`
  if (ids.some(dep => sameId(dep, id))) return `${id} can't depend on itself.`
  const cycle = cycleThrough(id, ids, tasks)
  return cycle ? `That makes a cycle, ${cycle.join(' → ')}: drop one of these dependencies.` : undefined
}

/** A path of dependencies from `id` back to itself, once `id` depends on `ids`; undefined when there is none. */
function cycleThrough(id: string, ids: readonly string[], tasks: readonly Task[]): string[] | undefined {
  const idsOf = (one: string) => {
    const task = taskWithId(tasks, one)
    return sameId(one, id) ? ids : task ? dependenciesOf(task) : []
  }
  const seen = new Set<string>()
  const walk = (path: readonly string[]): string[] | undefined => {
    for (const next of idsOf(path.at(-1)!)) {
      const name = taskWithId(tasks, next)?.id ?? next
      if (sameId(name, id)) return [...path, id]
      if (seen.has(name)) continue
      seen.add(name)
      const found = walk([...path, name])
      if (found) return found
    }
    return undefined
  }
  return walk([id])
}

/** The open tasks that waited on `closed` and wait on nothing now. */
export function unblockedBy(closed: Task, tasks: readonly Task[]): Task[] {
  return tasks.filter(task => isOpen(task) && dependenciesOf(task).some(id => sameId(id, closed.id)) && !isBlocked(task, tasks))
}

/** The task's pull request: the link on its last "PR: <url>" note line (a bare url or a markdown link). */
export function prIn(body: string): string | undefined {
  const lines = body.split('\n').filter(line => /\bPR:/.test(line))
  return lines.map(line => line.slice(line.search(/\bPR:/)).match(/https?:\/\/[^\s)\]>]+/)?.[0]).filter(Boolean).pop()
}

/** How the task is named to the user: its id, and its PR's number once it has one ("T-078 (#43)"). */
export function taskRef(task: Task): string {
  const number = prIn(task.body)?.match(/\/pull\/(\d+)/)?.[1]
  return number ? `${task.id} (#${number})` : task.id
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

/** The order that puts a task at the top or bottom of the section `place` names (same sprint and urgency). */
export function edgeOrder(tasks: readonly Task[], place: Pick<Task, 'sprint' | 'urgent'>, edge: 'top' | 'bottom'): number {
  const orders = tasks.filter(task => task.sprint === place.sprint && task.urgent === place.urgent).map(task => task.order)
  if (orders.length === 0) return 0
  return edge === 'top' ? Math.min(...orders) - 1 : Math.max(...orders) + 1
}

/** A new task's body: the task template with {goal}, {title}, {id} and {created} filled in. */
export function bodyOf(goal: string, template = SHIPPED['task-template'], values: Record<string, string> = {}): string {
  const body = fill(template, { ...values, goal: goal.trim() })
  return body.endsWith('\n') ? body : `${body}\n`
}

export function fileNameOf(naming: TaskNaming, id: string, title: string): string {
  return fill(naming.fileName, { id, slug: slugOf(title), title: title.trim() })
}

/** The body with its Goal section's text replaced (a Goal section is added when there is none). */
export function withGoalText(body: string, goal: string): string {
  const start = body.indexOf('## Goal')
  if (start < 0) return `## Goal\n${goal.trim()}\n\n${body}`
  const next = body.indexOf('\n## ', start + 1)
  const rest = next < 0 ? '' : `\n${body.slice(next + 1)}`
  return `${body.slice(0, start)}## Goal\n${goal.trim()}\n${rest}`
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

/** How a section is named to the user; `now` is "Currently working on". */
export const WHEN_LABELS: Record<When, string> = {
  now: 'currently working on',
  'this-sprint': 'this sprint',
  'next-sprint': 'next sprint',
  backlog: 'backlog',
}

/** One line per task, for the model; `tasks` tells what it waits on. */
export function taskLine(task: Task, today: string, config: SprintConfig, tasks: readonly Task[] = []): string {
  const parts = [`${taskRef(task)} [${task.status}] ${task.title}`, WHEN_LABELS[whenOf(task, today, config)]]
  if (task.owner) parts.push(`owner ${task.owner}`)
  if (task.rolled > 0) parts.push(`rolled ${task.rolled}x`)
  if (isOpen(task)) parts.push(waitsText(task, tasks))
  return parts.filter(Boolean).join(' · ')
}

// ---- With files: the task files of the session's project ----

export async function tasksDir(files: Files): Promise<string> {
  return `${await files.root()}/${(await settingsFrom(files)).tasks.folder}`
}

export async function today(files: Files): Promise<string> {
  return dayOf(await files.now())
}

const byOrder = (a: Task, b: Task) => a.order - b.order || a.id.localeCompare(b.id, undefined, { numeric: true })

/** Reads every task file and publishes the list to the pane. */
export async function listTasks(files: Files): Promise<Task[]> {
  const dir = await tasksDir(files)
  const entries = await files.list(dir).catch(() => [])
  const names = entries.filter(entry => entry.kind === 'file' && entry.name.endsWith('.md'))
  const parsed = await Promise.all(
    names.map(async entry => parseTask(await files.read(`${dir}/${entry.name}`), `${dir}/${entry.name}`)),
  )
  const tasks = parsed.filter(task => task.id !== '').sort(byOrder)
  await files.publishTasks(tasks)
  return tasks
}

export async function findTask(files: Files, id: string): Promise<Task | undefined> {
  return taskWithId(await listTasks(files), id)
}

/** Writes the task file, then publishes the fresh list. */
export async function saveTask(files: Files, task: Task): Promise<void> {
  await files.write(task.file, formatTask(task))
  await listTasks(files)
}

export type NewTask = { title: string; goal: string; when: When; dependsOn?: string[] }

export async function createTask(files: Files, input: NewTask): Promise<Task> {
  const settings = await settingsFrom(files)
  const day = await today(files)
  const tasks = await listTasks(files)
  const id = nextId(tasks, settings.tasks)
  const title = oneLine(input.title)
  const template = await projectText(files, 'task-template')
  const place = placeOf(input.when, day, settings.sprint)
  const task: Task = {
    id,
    title,
    ...place,
    status: 'todo',
    owner: '',
    rolled: 0,
    order: edgeOrder(tasks, place, input.when === 'now' ? 'top' : 'bottom'),
    created: day,
    dependsOn: input.dependsOn ?? [],
    file: `${await tasksDir(files)}/${fileNameOf(settings.tasks, id, title)}`,
    body: bodyOf(input.goal, template, { id, title, created: day }),
  }
  await saveTask(files, task)
  return task
}
