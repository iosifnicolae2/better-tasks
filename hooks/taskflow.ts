import type { Task, TaskStatus, When } from '../types'
import type { Files } from './io'
import { settingsFrom } from './settings'
import { sprintStart } from './sprints'
import type { SprintConfig } from './sprints'
import { edgeOrder, listTasks, placeOf, saveTask, taskRef, today, withGoalText, withNote } from './tasks'
import { oneLine } from './yaml'

// What happens to a task: changed, started, finished (finished ones are logged in docs/tasks.md).


const logHeader = (path: string) =>
  '# Finished tasks\n' +
  `One row per finished task; grep it, don't read it: \`grep -i <word> ${path}\`.\n\n` +
  'date | teammate | task | summary | commits | session\n' +
  '--- | --- | --- | --- | --- | ---\n'

export type TaskChange = {
  status?: TaskStatus
  when?: When
  owner?: string
  title?: string
  goal?: string
  note?: string
  commits?: string
}

const cell = (text: string) => text.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '/').trim()

export function logRow(task: Task, day: string, session: string, change: TaskChange): string {
  const owner = task.owner || 'main'
  const cells = [
    day,
    owner,
    `${taskRef(task)} ${task.title}`,
    change.note ?? task.title,
    change.commits ?? '',
    `session ${session} teammate ${owner}`,
  ]
  return `${cells.map(cell).join(' | ')}\n`
}

/** Applies a change to a task; `done` also moves it into the current sprint and logs it. */
export async function changeTask(
  files: Files,
  task: Task,
  change: TaskChange,
  config: SprintConfig,
): Promise<Task> {
  const day = await today(files)
  let next: Task = { ...task }
  if (change.when) next = { ...next, ...(await moved(files, task, change.when, day, config)) }
  if (change.owner !== undefined) next.owner = oneLine(change.owner)
  if (change.status) next.status = change.status
  if (change.title?.trim()) next.title = oneLine(change.title)
  if (change.goal?.trim()) next.body = withGoalText(next.body, change.goal)
  if (change.note) next.body = withNote(next.body, day, change.note)
  if (change.status === 'done') next = { ...next, urgent: false, sprint: sprintStart(day, config) }
  await saveTask(files, next)
  if (change.status === 'done' && task.status !== 'done') await logDone(files, next, day, change)
  return next
}

/** A task moved to another section lands at its edge: the top for now, the bottom otherwise. */
async function moved(files: Files, task: Task, when: When, day: string, config: SprintConfig): Promise<Partial<Task>> {
  const place = placeOf(when, day, config)
  if (place.sprint === task.sprint && place.urgent === task.urgent) return place
  const others = (await listTasks(files)).filter(one => one.id !== task.id)
  return { ...place, order: edgeOrder(others, place, when === 'now' ? 'top' : 'bottom') }
}

async function logDone(files: Files, task: Task, day: string, change: TaskChange): Promise<void> {
  const log = (await settingsFrom(files)).paths.log
  const path = `${await files.root()}/${log}`
  const text = await files.read(path).catch(() => logHeader(log))
  const row = logRow(task, day, await files.sessionId(), change)
  await files.write(path, `${text.endsWith('\n') ? text : `${text}\n`}${row}`)
}

export function finishTask(files: Files, task: Task, change: TaskChange, config: SprintConfig): Promise<Task> {
  return changeTask(files, task, { ...change, status: 'done' }, config)
}

/** What to tell the coordinator to start a task now. */
export function startPrompt(task: Task): string {
  return (
    `Start ${task.id} "${task.title}" now. Route it to the teammate that owns this area ` +
    `(check team_status) or spawn one, and give it the task file ${task.file}.`
  )
}
