// One-time move of a project's files from the old folder (.claude/manager/, tasks in its tasks/)
// to .claude/tasks/ (tasks, sprints.md, config.json and the overrides side by side).
export const OLD_DIR = '.claude/manager';
export const NEW_DIR = '.claude/tasks';
/** Old paths in a config.json, pointed at the new folder. */
export function movedConfig(text) {
    return text.replaceAll(`${OLD_DIR}/tasks`, NEW_DIR).replaceAll(OLD_DIR, NEW_DIR);
}
/** Moves the old folder when the project has it and not the new one; returns the line to log, if it moved. */
export async function migrateFolder(io) {
    const root = await io.root();
    const isDir = (path) => io.list(path).then(() => true, () => false);
    const [from, to] = [`${root}/${OLD_DIR}`, `${root}/${NEW_DIR}`];
    if (!(await isDir(from)) || (await isDir(to)))
        return undefined;
    if ((await io.run(['mv', from, to])).exitCode !== 0)
        return `better-tasks: could not move ${OLD_DIR}/ to ${NEW_DIR}/`;
    if (await isDir(`${to}/tasks`)) {
        for (const entry of await io.list(`${to}/tasks`))
            await io.run(['mv', '-n', `${to}/tasks/${entry.name}`, `${to}/${entry.name}`]);
        await io.run(['rmdir', `${to}/tasks`]);
    }
    const config = await io.read(`${to}/config.json`).catch(() => undefined);
    if (config !== undefined && movedConfig(config) !== config)
        await io.write(`${to}/config.json`, movedConfig(config));
    return `better-tasks: moved ${OLD_DIR}/ to ${NEW_DIR}/ (tasks, sprints, settings)`;
}
