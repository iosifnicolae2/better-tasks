import { settingsFrom } from './settings';
// sprints.md (path: settings.paths.sprints): one "## <start> · <label>" section per sprint, its goal and review.
const HEADER = '# Sprints\nOne section per sprint: its goal, then the review written when it ends.\n';
function split(text, start) {
    const at = text.search(new RegExp(`^## ${start}\\b`, 'm'));
    if (at < 0)
        return undefined;
    const next = text.indexOf('\n## ', at + 1);
    const end = next < 0 ? text.length : next + 1;
    return { before: text.slice(0, at), section: text.slice(at, end), after: text.slice(end) };
}
function withSection(text, start, label, change) {
    const found = split(text, start);
    if (found)
        return found.before + change(found.section) + found.after;
    const base = text.trim() ? `${text.trimEnd()}\n\n` : `${HEADER}\n`;
    return base + change(`## ${start} · ${label}\n`);
}
export function goalOf(text, start) {
    return split(text, start)?.section.match(/^Goal: (.*)$/m)?.[1]?.trim() ?? '';
}
export function withGoal(text, start, label, goal) {
    const line = `Goal: ${goal.trim()}`;
    return withSection(text, start, label, section => /^Goal: /m.test(section)
        ? section.replace(/^Goal: .*$/m, line)
        : section.replace(/\n/, `\n${line}\n`));
}
export function withReview(text, start, label, review) {
    const list = (tasks) => tasks.length === 0 ? '- none\n' : tasks.map(task => `- ${task.id} ${task.title}\n`).join('');
    const block = `\n### Review\nShipped:\n${list(review.shipped)}Rolled over:\n${list(review.rolled)}`;
    return withSection(text, start, label, section => `${section.trimEnd()}\n${block}`);
}
async function sprintsPath(files) {
    return `${await files.root()}/${(await settingsFrom(files)).paths.sprints}`;
}
export async function readSprints(files) {
    return files.read(await sprintsPath(files)).catch(() => '');
}
export async function writeSprints(files, text) {
    await files.write(await sprintsPath(files), text);
}
