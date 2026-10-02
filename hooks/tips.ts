import type { Io } from './io'
import type { Settings } from './settings'
import { goalOf, readSprints } from './sprintlog'
import { sprintLabel, sprintStart } from './sprints'
import { isOpen, listTasks, today } from './tasks'
import { projectText } from './texts'

// Shown at every session start as dim transcript lines ($.ui.log): the sprint now, then the tips (texts.ts,
// or the project's tips.md). The model never reads them.

export function tipsLines(label: string, goal: string, open: number, tips: string): string[] {
  const lines = tips.split('\n').map(line => line.trimEnd()).filter(Boolean)
  return [`supermanager · ${label} · goal: ${goal || 'not set'} · ${open} open`, ...lines]
}

export async function startupTips(io: Io, settings: Settings): Promise<string[]> {
  const start = sprintStart(await today(io), settings.sprint)
  const open = (await listTasks(io)).filter(task => task.sprint === start && isOpen(task)).length
  const goal = goalOf(await readSprints(io), start)
  return tipsLines(sprintLabel(start, settings.sprint), goal, open, await projectText(io, 'tips'))
}
