import { goalOf, readSprints, withReview, writeSprints } from './sprintlog';
import { sprintLabel, sprintStart } from './sprints';
import { isOpen, listTasks, saveTask } from './tasks';
// The sprint boundary: unfinished work rolls into the new sprint, the old one gets a review.
/** The open tasks of sprints before `current`, moved into it. */
export function rolledOver(tasks, current) {
    return tasks
        .filter(task => isOpen(task) && task.sprint !== 'backlog' && task.sprint < current)
        .map(task => ({ ...task, sprint: current, rolled: task.rolled + 1 }));
}
/**
 * Tasks whose sprint is no boundary under `config` (its length or start day changed), put on one:
 * the sprint holding their date, or `current` for open work that would land in the past.
 */
export function realigned(tasks, current, config) {
    return tasks.flatMap(task => {
        if (task.sprint === 'backlog')
            return [];
        const aligned = sprintStart(task.sprint, config);
        const sprint = isOpen(task) && aligned < current ? current : aligned;
        return sprint === task.sprint ? [] : [{ ...task, sprint }];
    });
}
export function shippedIn(tasks, sprint) {
    return tasks.filter(task => task.status === 'done' && task.sprint === sprint);
}
/** Moves unfinished work into `current` and writes the review of `old`. */
export async function rollOver(files, old, current, config) {
    const tasks = await listTasks(files);
    const moved = rolledOver(tasks, current);
    const shipped = shippedIn(tasks, old);
    for (const task of moved)
        await saveTask(files, task);
    const oldLabel = sprintLabel(old, config);
    const sprints = withReview(await readSprints(files), old, oldLabel, { shipped, rolled: moved });
    await writeSprints(files, sprints);
    const label = sprintLabel(current, config);
    const summary = `${oldLabel} shipped ${shipped.length}, rolled over ${moved.length}.`;
    const goal = goalOf(sprints, current);
    const ask = goal ? `Its goal is "${goal}". ` : 'Ask the user for its goal (then call sprint_goal). ';
    return {
        toast: `${label} started. ${summary}`,
        notice: `${label} just started. ${summary} ${ask}Ask which backlog tasks to pull in. Start nothing on your own.`,
    };
}
