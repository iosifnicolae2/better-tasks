import { goalOf, readSprints } from './sprintlog';
import { sprintStart, sprintTitle } from './sprints';
import { isOpen, listTasks, today } from './tasks';
import { projectText } from './texts';
// Shown at every session start as dim transcript lines ($.ui.log): the sprint now, then the tips (texts.ts,
// or the project's tips.md). The model never reads them.
export function tipsLines(label, goal, open, tips) {
    const lines = tips.split('\n').map(line => line.trimEnd()).filter(Boolean);
    return [`better-tasks · ${label} · goal: ${goal || 'not set'} · ${open} open`, ...lines];
}
export async function startupTips(io, settings) {
    const day = await today(io);
    const start = sprintStart(day, settings.sprint);
    const open = (await listTasks(io)).filter(task => task.sprint === start && isOpen(task)).length;
    const goal = goalOf(await readSprints(io), start);
    return tipsLines(sprintTitle(start, settings.sprint, day), goal, open, await projectText(io, 'tips'));
}
