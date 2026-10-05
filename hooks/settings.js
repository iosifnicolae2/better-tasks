import { flowOf, GIT_FLOWS } from './gitflow';
/** How the before/after videos are encoded: low = 720p small file, medium = 1080p, high = 1080p sharper. */
export const VIDEO_QUALITIES = ['low', 'medium', 'high'];
/** How hard a task is; each level has its own model and effort. */
export const LEVELS = ['easy', 'normal', 'hard'];
const EDITORS = ['auto', 'default', 'code', 'idea', 'cursor', 'zed'];
/** "inherit": the model of the session that spawns the teammate (the lead). */
export const MODELS = ['sonnet', 'opus', 'fable', 'haiku', 'inherit'];
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
/** Every key a project's config.json may set. */
export const FIELDS = {
    editor: { kind: 'string', values: EDITORS },
    worktree: { kind: 'boolean' },
    longCache: { kind: 'boolean' },
    statusEvery: { kind: 'number' },
    keepAwake: { kind: 'boolean' },
    demoVideos: { kind: 'boolean' },
    offScreen: { kind: 'boolean' },
    videoQuality: { kind: 'string', values: VIDEO_QUALITIES },
    pullRequests: { kind: 'boolean' },
    gitFlow: { kind: 'string', values: GIT_FLOWS },
    devBranch: { kind: 'string' },
    instructions: { kind: 'string' },
    excludeWorktreesFromIde: { kind: 'boolean' },
    prTemplate: { kind: 'string' },
    openPrInBrowser: { kind: 'boolean' },
    shareWithTeam: { kind: 'boolean' },
    useBetterTasks: { kind: 'boolean' },
    tasksInGit: { kind: 'boolean' },
    easyModel: { kind: 'string', values: MODELS },
    easyEffort: { kind: 'string', values: EFFORTS },
    normalModel: { kind: 'string', values: MODELS },
    normalEffort: { kind: 'string', values: EFFORTS },
    hardModel: { kind: 'string', values: MODELS },
    hardEffort: { kind: 'string', values: EFFORTS },
    escalate: { kind: 'boolean' },
    sprintWeeks: { kind: 'string', values: ['1', '2', '3', '4'] },
    sprintStart: { kind: 'string', values: WEEKDAYS },
    taskPrefix: { kind: 'string' },
    taskPadding: { kind: 'number' },
    taskStart: { kind: 'number' },
    taskFileName: { kind: 'string' },
    tasksFolder: { kind: 'string' },
    logFile: { kind: 'string' },
    sprintsFile: { kind: 'string' },
};
export const DEFAULTS = {
    editor: 'auto',
    worktree: false,
    longCache: true,
    statusEvery: 10,
    keepAwake: true,
    demoVideos: false,
    offScreen: false,
    videoQuality: 'medium',
    pullRequests: false,
    gitFlow: 'direct',
    devBranch: 'dev',
    instructions: '',
    excludeWorktreesFromIde: false,
    prTemplate: '',
    openPrInBrowser: true,
    shareWithTeam: false,
    useBetterTasks: true,
    tasksInGit: true,
    easyModel: 'opus',
    easyEffort: 'low',
    normalModel: 'opus',
    normalEffort: 'medium',
    hardModel: 'opus',
    hardEffort: 'high',
    escalate: true,
    sprintWeeks: '1',
    sprintStart: 'monday',
    taskPrefix: 'T-',
    taskPadding: 3,
    taskStart: 1,
    taskFileName: '{id}-{slug}.md',
    tasksFolder: '.claude/tasks',
    logFile: 'docs/tasks.md',
    sprintsFile: '.claude/tasks/sprints.md',
};
export function settingsOf(options) {
    const value = (key) => options[key] ?? DEFAULTS[key];
    const oneOf = (key, list) => (list.includes(String(value(key))) ? String(value(key)) : String(DEFAULTS[key]));
    const choiceOf = (level) => ({ model: oneOf(`${level}Model`, MODELS), effort: oneOf(`${level}Effort`, EFFORTS) });
    return {
        editor: value('editor'),
        worktree: value('worktree') === true,
        longCache: value('longCache') !== false,
        statusEvery: Math.max(0, Number(value('statusEvery')) || 0),
        keepAwake: value('keepAwake') !== false,
        demoVideos: value('demoVideos') === true,
        offScreen: value('offScreen') === true,
        videoQuality: oneOf('videoQuality', VIDEO_QUALITIES),
        gitFlow: flowOf(options),
        devBranch: String(value('devBranch')).trim() || 'dev',
        instructions: String(value('instructions')),
        excludeWorktreesFromIde: value('excludeWorktreesFromIde') === true,
        useBetterTasks: value('useBetterTasks') !== false,
        prTemplate: String(value('prTemplate')).trim(),
        openPrInBrowser: value('openPrInBrowser') !== false,
        models: {
            easy: choiceOf('easy'),
            normal: choiceOf('normal'),
            hard: choiceOf('hard'),
            escalate: value('escalate') !== false,
        },
        sprint: {
            weeks: Math.min(4, Math.max(1, Number(value('sprintWeeks')) || 1)),
            startDay: Math.max(0, WEEKDAYS.indexOf(String(value('sprintStart')))),
        },
        tasks: {
            prefix: String(value('taskPrefix')),
            padding: Number(value('taskPadding')),
            start: Number(value('taskStart')),
            fileName: String(value('taskFileName')),
            folder: String(value('tasksFolder')),
        },
        paths: { log: String(value('logFile')), sprints: String(value('sprintsFile')) },
    };
}
// ---- The project's config.json ----
export const CONFIG_FILE = '.claude/tasks/config.json';
/** Settings that belong to the project only: the settings page writes them to its config.json, never to /config. */
export const PROJECT_KEYS = ['gitFlow', 'devBranch', 'instructions', 'offScreen', 'prTemplate'];
function problemOf(key, value) {
    const field = FIELDS[key];
    if (!field)
        return `unknown key "${key}"`;
    if (field.values)
        return field.values.includes(String(value)) ? undefined : `"${key}" must be one of ${field.values.join(', ')}`;
    return typeof value === field.kind ? undefined : `"${key}" must be a ${field.kind}`;
}
/** Reads config.json's text; keys starting with "//" are comments. */
export function parseOverrides(text) {
    let json;
    try {
        json = JSON.parse(text);
    }
    catch (error) {
        return { values: {}, problems: [`${CONFIG_FILE} is not valid JSON (${error.message})`] };
    }
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
        return { values: {}, problems: [`${CONFIG_FILE} must hold one JSON object`] };
    }
    const values = {};
    const problems = [];
    for (const [key, value] of Object.entries(json)) {
        if (key.startsWith('//'))
            continue;
        const problem = problemOf(key, value);
        if (problem)
            problems.push(problem);
        else
            values[key] = value;
    }
    return { values, problems };
}
export async function readOverrides(files) {
    const text = await files.read(`${await files.root()}/${CONFIG_FILE}`).catch(() => undefined);
    return text === undefined ? { values: {}, problems: [] } : parseOverrides(text);
}
/** The settings of this project: the plugin's options with the project's config.json over them. */
export async function projectSettings(files, options) {
    return settingsOf({ ...options, ...(await readOverrides(files)).values });
}
/** What the parts read: the project's settings when `files` knows them, else the shipped defaults. */
export async function settingsFrom(files) {
    return files.config ? files.config() : settingsOf({});
}
/** Sets one key in the project's config.json, keeping every other key (comments too); refuses a file that isn't JSON. */
export async function saveProjectValue(files, key, value) {
    const path = `${await files.root()}/${CONFIG_FILE}`;
    const text = await files.read(path).catch(() => undefined);
    let json = {};
    if (text !== undefined) {
        try {
            json = JSON.parse(text);
        }
        catch (error) {
            return `${CONFIG_FILE} is not valid JSON (${error.message}); set "${key}" there by hand`;
        }
    }
    const { [`// ${key}`]: _example, ...rest } = json;
    await files.write(path, `${JSON.stringify({ ...rest, [key]: value }, null, 2)}\n`);
    return undefined;
}
