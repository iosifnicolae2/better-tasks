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
    labels: listIn(field('labels')).map(labelOf).filter(Boolean),
    dependsOn: listIn(field('dependsOn')),
    file,
    body,
  }
}

export function formatTask(task: Task): string {
  const value = (name: (typeof FIELDS)[number]) => {
    const raw = task[name]
    return typeof raw === 'string' ? yamlValue(oneLine(raw)) : String(raw)
  }
  const list = (name: string, items: readonly string[]) => (items.length > 0 ? [`${name}: [${items.map(yamlValue).join(', ')}]`] : [])
  const head = [...FIELDS.map(name => `${name}: ${value(name)}`.trimEnd()), ...list('labels', labelsOf(task)), ...list('dependsOn', dependenciesOf(task))]
  return `---\n${head.join('\n')}\n---\n${task.body}`
}

/** The items a one-line YAML list holds: "[T-071, checkout]", or the same without brackets. */
export function listIn(value: string): string[] {
  return value.replace(/^\[|\]$/g, '').split(',').map(readYamlValue).filter(Boolean)
}

/** A label as stored: lower case, a dash for spaces, only letters, digits and . _ / - ("Check out" is "check-out"). */
export function labelOf(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}._/-]/gu, '')
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

export function isOpen(task: Pick<Task, 'status'>): boolean {
  return task.status === 'todo' || task.status === 'doing'
}

/** What links a task to others: its id, status, labels and dependencies. */
export type Links = Pick<Task, 'id' | 'status' | 'labels' | 'dependsOn'>

/** Its dependencies: task ids and labels. None for a task kept in state from before the field existed (a plugin update mid-session). */
export const dependenciesOf = (task: Links): readonly string[] => task.dependsOn ?? []

/** Its labels; none for a task kept in state from before the field existed. */
export const labelsOf = (task: Pick<Task, 'labels'>): readonly string[] => task.labels ?? []

const sameId = (one: string, other: string) => one.trim().toLowerCase() === other.trim().toLowerCase()

const hasLabel = (task: Links, label: string) => labelsOf(task).includes(labelOf(label))

/** The task with this id, whatever its case. */
export function taskWithId<T extends Links>(tasks: readonly T[], id: string): T | undefined {
  return tasks.find(task => sameId(task.id, id))
}

/** The tasks one dependency names: the task with that id, else every other task with that label. */
function tasksNamed<T extends Links>(dependency: string, task: Links, tasks: readonly T[]): T[] {
  const named = taskWithId(tasks, dependency)
  return named ? [named] : tasks.filter(other => hasLabel(other, dependency) && !sameId(other.id, task.id))
}

/** The dependencies `task` still waits on: the open tasks they name. A closed (done or cancelled) or deleted one no longer holds it. */
export function blockersOf<T extends Links>(task: Links, tasks: readonly T[]): T[] {
  const open = dependenciesOf(task).flatMap(dependency => tasksNamed(dependency, task, tasks)).filter(isOpen)
  return open.filter((one, at) => open.indexOf(one) === at)
}

/** A task is blocked while a dependency is open: it isn't started until they are all done. */
export function isBlocked(task: Links, tasks: readonly Links[]): boolean {
  return blockersOf(task, tasks).length > 0
}

/** "waits on T-071 (#39), label checkout (T-074, T-075)", or '' when nothing holds the task. */
export function waitsText(task: Task, tasks: readonly Task[]): string {
  const parts = dependenciesOf(task).flatMap(dependency => {
    const open = tasksNamed(dependency, task, tasks).filter(isOpen)
    if (open.length === 0) return []
    return taskWithId(tasks, dependency) ? [taskRef(open[0]!)] : [`label ${labelOf(dependency)} (${open.map(taskRef).join(', ')})`]
  })
  return parts.length > 0 ? `waits on ${parts.join(', ')}` : ''
}

/** Whether the text reads as a task id ("T-071", "t-71"), whether or not that task exists. */
export function readsAsId(text: string, prefix: string): boolean {
  const trimmed = text.trim()
  return trimmed.toLowerCase().startsWith(prefix.toLowerCase()) && /^\d+$/.test(trimmed.slice(prefix.length))
}

/** Why labels can't be stored: one that reads as a task id would be taken for that task in dependsOn. */
export function labelProblem(labels: readonly string[], prefix: string): string | undefined {
  const idLike = labels.filter(label => readsAsId(label, prefix))
  return idLike.length > 0 ? `${idLike.join(', ')} reads as a task id: pick another label.` : undefined
}

/**
 * Why `task` (new or changed, with its labels and dependsOn as they would be) can't be saved: a dependency that names
 * no task id and no other task's label, itself, or a cycle. Undefined when it can.
 */
export function dependencyProblem(task: Links, tasks: readonly Links[]): string | undefined {
  const others = tasks.filter(other => !sameId(other.id, task.id))
  const unknown = dependenciesOf(task).filter(dependency => !taskWithId(tasks, dependency) && !others.some(other => hasLabel(other, dependency)))
  if (unknown.length > 0) return `No task or label ${unknown.join(', ')}: dependsOn takes task ids, or labels other tasks have.`
  if (dependenciesOf(task).some(dependency => sameId(dependency, task.id))) return `${task.id} can't depend on itself.`
  const cycle = cycleThrough(task, [...others, task])
  return cycle ? `That makes a cycle, ${cycle.join(' → ')}: drop one of these dependencies or labels.` : undefined
}

/** A path of open dependencies from `task` back to itself; undefined when there is none. */
function cycleThrough(task: Links, tasks: readonly Links[]): string[] | undefined {
  const seen = new Set<string>()
  const walk = (path: readonly Links[]): string[] | undefined => {
    for (const next of blockersOf(path.at(-1)!, tasks)) {
      if (next.id === task.id) return [...path, next].map(one => one.id)
      if (seen.has(next.id)) continue
      seen.add(next.id)
      const found = walk([...path, next])
      if (found) return found
    }
    return undefined
  }
  return walk([task])
}

/** The open tasks that waited on `closed` (by its id or a label it has) and wait on nothing now. */
export function unblockedBy(closed: Task, tasks: readonly Task[]): Task[] {
  const waitedOn = (task: Task) => dependenciesOf(task).some(dependency => tasksNamed(dependency, task, [closed]).length > 0)
  return tasks.filter(task => isOpen(task) && !sameId(task.id, closed.id) && waitedOn(task) && !isBlocked(task, tasks))
}

/** "labels checkout, api", or '' for a task with none. */
export function labelsText(task: Pick<Task, 'labels'>): string {
  return labelsOf(task).length > 0 ? `labels ${labelsOf(task).join(', ')}` : ''
}

/** Tasks under each label, in the order of `tasks`; a task with several labels is under each, one with none under "". */
export function byLabel(tasks: readonly Task[]): Map<string, Task[]> {
  const groups = new Map<string, Task[]>()
  const labels = [...new Set(tasks.flatMap(labelsOf))].sort()
  for (const label of [...labels, '']) {
    const tasksOf = tasks.filter(task => (label === '' ? labelsOf(task).length === 0 : labelsOf(task).includes(label)))
    if (tasksOf.length > 0) groups.set(label, tasksOf)
  }
  return groups
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
  parts.push(labelsText(task))
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

export type NewTask = { title: string; goal: string; when: When; labels?: string[]; dependsOn?: string[] }

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
    labels: input.labels ?? [],
    dependsOn: input.dependsOn ?? [],
    file: `${await tasksDir(files)}/${fileNameOf(settings.tasks, id, title)}`,
    body: bodyOf(input.goal, template, { id, title, created: day }),
  }
  await saveTask(files, task)
  return task
}
