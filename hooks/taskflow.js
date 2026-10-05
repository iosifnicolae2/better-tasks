import { settingsFrom } from './settings';
import { sprintStart } from './sprints';
import { edgeOrder, listTasks, placeOf, saveTask, today, withGoalText, withNote } from './tasks';
import { oneLine } from './yaml';
// What happens to a task: changed, started, finished (finished ones are logged in docs/tasks.md).
const logHeader = (path) => '# Finished tasks\n' +
    `One row per finished task; grep it, don't read it: \`grep -i <word> ${path}\`.\n\n` +
    'date | teammate | task | summary | commits | session\n' +
    '--- | --- | --- | --- | --- | ---\n';
const cell = (text) => text.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '/').trim();
export function logRow(task, day, session, change) {
    const owner = task.owner || 'main';
    const cells = [
        day,
        owner,
        `${task.id} ${task.title}`,
        change.note ?? task.title,
        change.commits ?? '',
        `session ${session} teammate ${owner}`,
    ];
    return `${cells.map(cell).join(' | ')}\n`;
}
/** Applies a change to a task; `done` also moves it into the current sprint and logs it. */
export async function changeTask(files, task, change, config) {
    const day = await today(files);
    let next = { ...task };
    if (change.when)
        next = { ...next, ...(await moved(files, task, change.when, day, config)) };
    if (change.owner !== undefined)
        next.owner = oneLine(change.owner);
    if (change.status)
        next.status = change.status;
    if (change.title?.trim())
        next.title = oneLine(change.title);
    if (change.goal?.trim())
        next.body = withGoalText(next.body, change.goal);
    if (change.note)
        next.body = withNote(next.body, day, change.note);
    if (change.status === 'done')
        next = { ...next, urgent: false, sprint: sprintStart(day, config) };
    await saveTask(files, next);
    if (change.status === 'done' && task.status !== 'done')
        await logDone(files, next, day, change);
    return next;
}
/** A task moved to another section lands at its edge: the top for now, the bottom otherwise. */
async function moved(files, task, when, day, config) {
    const place = placeOf(when, day, config);
    if (place.sprint === task.sprint && place.urgent === task.urgent)
        return place;
    const others = (await listTasks(files)).filter(one => one.id !== task.id);
    return { ...place, order: edgeOrder(others, place, when === 'now' ? 'top' : 'bottom') };
}
async function logDone(files, task, day, change) {
    const log = (await settingsFrom(files)).paths.log;
    const path = `${await files.root()}/${log}`;
    const text = await files.read(path).catch(() => logHeader(log));
    const row = logRow(task, day, await files.sessionId(), change);
    await files.write(path, `${text.endsWith('\n') ? text : `${text}\n`}${row}`);
}
export function finishTask(files, task, change, config) {
    return changeTask(files, task, { ...change, status: 'done' }, config);
}
/** What to tell the coordinator to start a task now. */
export function startPrompt(task) {
    return (`Start ${task.id} "${task.title}" now. Route it to the teammate that owns this area ` +
        `(check team_status) or spawn one, and give it the task file ${task.file}.`);
}
