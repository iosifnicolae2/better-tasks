import { update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Task } from '../types'
import { goalOf, readSprints, withReview, writeSprints } from './sprintlog'
import { sprintLabel, sprintStart } from './sprints'
import type { SprintConfig } from './sprints'
import { noticeState } from './state'
import { isOpen, listTasks, saveTask, today } from './tasks'

// The sprint boundary: unfinished work rolls into the new sprint, the old one gets a review.

/** The open tasks of sprints before `current`, moved into it. */
export function rolledOver(tasks: readonly Task[], current: string): Task[] {
  return tasks
    .filter(task => isOpen(task) && task.sprint !== 'backlog' && task.sprint < current)
    .map(task => ({ ...task, sprint: current, rolled: task.rolled + 1 }))
}

export function shippedIn(tasks: readonly Task[], sprint: string): Task[] {
  return tasks.filter(task => task.status === 'done' && task.sprint === sprint)
}

async function storeKey($: EngineInterface): Promise<string> {
  return `sprint:${await $.session.root()}`
}

/** Checks whether a new sprint began since last seen; rolls over when it did. */
export async function checkSprint($: EngineInterface, config: SprintConfig): Promise<void> {
  const key = await storeKey($)
  const current = sprintStart(await today($), config)
  const seen = (await $.store.get(key)) as string | undefined
  if (seen !== undefined && seen < current) await rollOver($, seen, current, config)
  if (seen !== current) await $.store.set(key, current)
}

export async function rollOver($: EngineInterface, old: string, current: string, config: SprintConfig): Promise<void> {
  const tasks = await listTasks($)
  const moved = rolledOver(tasks, current)
  const shipped = shippedIn(tasks, old)
  for (const task of moved) await saveTask($, task)

  const oldLabel = sprintLabel(old, config)
  await writeSprints($, withReview(await readSprints($), old, oldLabel, { shipped, rolled: moved }))

  const label = sprintLabel(current, config)
  const summary = `${oldLabel} shipped ${shipped.length}, rolled over ${moved.length}.`
  $.ui.toast(`${label} started. ${summary}`)
  const goal = goalOf(await readSprints($), current)
  await update($, noticeState, () =>
    `${label} just started. ${summary} ` +
    (goal ? `Its goal is "${goal}". ` : 'Ask the user for its goal (then call sprint_goal). ') +
    'Ask which backlog tasks to pull in. Start nothing on your own.',
  )
}
