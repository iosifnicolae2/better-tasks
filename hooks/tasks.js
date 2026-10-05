import { dayOf, nextSprint, sprintStart } from './sprints';
import { settingsFrom, settingsOf } from './settings';
import { fill, projectText, SHIPPED } from './texts';
import { oneLine, readYamlValue, yamlValue } from './yaml';
const DEFAULT_NAMING = settingsOf({}).tasks;
const FIELDS = ['id', 'title', 'sprint', 'urgent', 'status', 'owner', 'rolled', 'order', 'created'];
const STATUSES = ['todo', 'doing', 'done', 'cancelled'];
// ---- Pure: one task file ----
export function parseTask(text, file) {
    const [, head = '', body = ''] = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/) ?? [];
    const field = (name) => readYamlValue(head.match(new RegExp(`^${name}:[ \\t]*(.*)$`, 'm'))?.[1] ?? '');
    const status = field('status');
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
        file,
        body,
    };
}
export function formatTask(task) {
    const value = (name) => {
        const raw = task[name];
        return typeof raw === 'string' ? yamlValue(oneLine(raw)) : String(raw);
    };
    const head = FIELDS.map(name => `${name}: ${value(name)}`.trimEnd()).join('\n');
    return `---\n${head}\n---\n${task.body}`;
}
export function slugOf(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40)
        .replace(/-+$/, '');
}
/** The id after the highest one with this prefix: T-001, T-002, … (prefix, padding and start are settings). */
export function nextId(tasks, naming = DEFAULT_NAMING) {
    const numbers = tasks
        .filter(task => task.id.startsWith(naming.prefix))
        .map(task => Number(task.id.slice(naming.prefix.length)) || 0);
    const next = Math.max(naming.start - 1, ...numbers) + 1;
    return `${naming.prefix}${String(next).padStart(naming.padding, '0')}`;
}
export function isOpen(task) {
    return task.status === 'todo' || task.status === 'doing';
}
/** Where a "when" puts a task: its sprint and whether it is urgent. */
export function placeOf(when, today, config) {
    const current = sprintStart(today, config);
    if (when === 'backlog')
        return { sprint: 'backlog', urgent: false };
    if (when === 'next-sprint')
        return { sprint: nextSprint(current, config), urgent: false };
    return { sprint: current, urgent: when === 'now' };
}
/** The "when" a task stands at today. */
export function whenOf(task, today, config) {
    const current = sprintStart(today, config);
    if (task.sprint === 'backlog')
        return 'backlog';
    if (task.sprint > current)
        return 'next-sprint';
    return task.urgent ? 'now' : 'this-sprint';
}
/** The order that puts a task at the top or bottom of the section `place` names (same sprint and urgency). */
export function edgeOrder(tasks, place, edge) {
    const orders = tasks.filter(task => task.sprint === place.sprint && task.urgent === place.urgent).map(task => task.order);
    if (orders.length === 0)
        return 0;
    return edge === 'top' ? Math.min(...orders) - 1 : Math.max(...orders) + 1;
}
/** A new task's body: the task template with {goal}, {title}, {id} and {created} filled in. */
export function bodyOf(goal, template = SHIPPED['task-template'], values = {}) {
    const body = fill(template, { ...values, goal: goal.trim() });
    return body.endsWith('\n') ? body : `${body}\n`;
}
export function fileNameOf(naming, id, title) {
    return fill(naming.fileName, { id, slug: slugOf(title), title: title.trim() });
}
/** The body with its Goal section's text replaced (a Goal section is added when there is none). */
export function withGoalText(body, goal) {
    const start = body.indexOf('## Goal');
    if (start < 0)
        return `## Goal\n${goal.trim()}\n\n${body}`;
    const next = body.indexOf('\n## ', start + 1);
    const rest = next < 0 ? '' : `\n${body.slice(next + 1)}`;
    return `${body.slice(0, start)}## Goal\n${goal.trim()}\n${rest}`;
}
/** Adds a dated line at the end of the Notes section. */
export function withNote(body, day, note) {
    const line = `- ${day}: ${note.trim()}\n`;
    const start = body.indexOf('## Notes');
    if (start < 0)
        return `${body.trimEnd()}\n\n## Notes\n${line}`;
    const next = body.indexOf('\n## ', start + 1);
    if (next < 0)
        return `${body.trimEnd()}\n${line}`;
    return `${body.slice(0, next).trimEnd()}\n${line}${body.slice(next)}`;
}
/** How a section is named to the user; `now` is "Currently working on". */
export const WHEN_LABELS = {
    now: 'currently working on',
    'this-sprint': 'this sprint',
    'next-sprint': 'next sprint',
    backlog: 'backlog',
};
/** One line per task, for the model. */
export function taskLine(task, today, config) {
    const parts = [`${task.id} [${task.status}] ${task.title}`, WHEN_LABELS[whenOf(task, today, config)]];
    if (task.owner)
        parts.push(`owner ${task.owner}`);
    if (task.rolled > 0)
        parts.push(`rolled ${task.rolled}x`);
    return parts.join(' · ');
}
// ---- With files: the task files of the session's project ----
export async function tasksDir(files) {
    return `${await files.root()}/${(await settingsFrom(files)).tasks.folder}`;
}
export async function today(files) {
    return dayOf(await files.now());
}
const byOrder = (a, b) => a.order - b.order || a.id.localeCompare(b.id, undefined, { numeric: true });
/** Reads every task file and publishes the list to the pane. */
export async function listTasks(files) {
    const dir = await tasksDir(files);
    const entries = await files.list(dir).catch(() => []);
    const names = entries.filter(entry => entry.kind === 'file' && entry.name.endsWith('.md'));
    const parsed = await Promise.all(names.map(async (entry) => parseTask(await files.read(`${dir}/${entry.name}`), `${dir}/${entry.name}`)));
    const tasks = parsed.filter(task => task.id !== '').sort(byOrder);
    await files.publishTasks(tasks);
    return tasks;
}
export async function findTask(files, id) {
    return (await listTasks(files)).find(task => task.id.toLowerCase() === id.trim().toLowerCase());
}
/** Writes the task file, then publishes the fresh list. */
export async function saveTask(files, task) {
    await files.write(task.file, formatTask(task));
    await listTasks(files);
}
export async function createTask(files, input) {
    const settings = await settingsFrom(files);
    const day = await today(files);
    const tasks = await listTasks(files);
    const id = nextId(tasks, settings.tasks);
    const title = oneLine(input.title);
    const template = await projectText(files, 'task-template');
    const place = placeOf(input.when, day, settings.sprint);
    const task = {
        id,
        title,
        ...place,
        status: 'todo',
        owner: '',
        rolled: 0,
        order: edgeOrder(tasks, place, input.when === 'now' ? 'top' : 'bottom'),
        created: day,
        file: `${await tasksDir(files)}/${fileNameOf(settings.tasks, id, title)}`,
        body: bodyOf(input.goal, template, { id, title, created: day }),
    };
    await saveTask(files, task);
    return task;
}
