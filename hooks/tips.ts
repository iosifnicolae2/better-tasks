import type { Io } from './io'
import type { Settings } from './settings'
import { goalOf, readSprints } from './sprintlog'
import { sprintLabel, sprintStart } from './sprints'
import { isOpen, listTasks, today } from './tasks'

// Shown at every session start as dim transcript lines ($.ui.log): the sprint now, then how to use the mod.
// The model never reads them.

export const TIPS = [
  '/tasks  ↑↓ select · enter menu · ⌥↑ ⌥↓ move · b backlog · c settings',
  '"create a task …" → asks which sprint · "start T-003" → a teammate takes it',
  '/away  screens off, Mac keeps working',
]

export function tipsLines(label: string, goal: string, open: number): string[] {
  return [`supermanager · ${label} · goal: ${goal || 'not set'} · ${open} open`, ...TIPS]
}

export async function startupTips(io: Io, settings: Settings): Promise<string[]> {
  const start = sprintStart(await today(io), settings.sprint)
  const open = (await listTasks(io)).filter(task => task.sprint === start && isOpen(task)).length
  const goal = goalOf(await readSprints(io), start)
  return tipsLines(sprintLabel(start, settings.sprint), goal, open)
}
