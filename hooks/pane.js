import { atom, read, update } from 'claude-code';
import { Board, ICONS, TITLES, sectionsOf, shortDates, shifted, wheeled } from './board';
import { searchTasks } from './search';
import { ConfigPage } from './configpage';
import { quickTimePlay, VIDEOS_FOLDER } from './demovideo';
import { openCommand } from './editor';
import { CONFIG_FILE, PROJECT_KEYS, projectSettings, readOverrides, saveProjectValue, settingsFrom } from './settings';
import { pathsOf } from './instructions';
import { findPrTemplate, NEW_TEMPLATE, shownPath } from './prtemplate';
import { goalOf, readSprints } from './sprintlog';
import { daysLeft, daysLeftLabel, nextSprint, sprintEnd, sprintLabel, sprintStart, weekLabel } from './sprints';
import { changeTask, finishTask, startPrompt } from './taskflow';
import { isOpen, listTasks, placeOf, saveTask, today, whenOf } from './tasks';
import { isActive } from './team';
import { overridePath, starterFiles } from './texts';
// The better-tasks pane: /better-tasks opens the board, /better-tasks config its settings page. This file holds `$`.
// (/tasks is Claude Code's own command, so the pane cannot take that name.)
const PANE = 'better-tasks-sprint';
const REFRESH_MS = 30_000;
const FOCUS_RETRY_MS = 150;
const PANE_OPEN = { id: PANE, title: 'Sprint', focus: true, columns: 76 };
/** $.store key: the board was open when this project's last session ended. */
const OPEN_KEY = 'pane.open';
/** $.store key: the Closed section is expanded. */
const CLOSED_KEY = 'pane.closedOpen';
/** $.store key: the settings row the focus ring is on, for its description line. */
const CONFIG_ROW_KEY = 'pane.configRow';
const NATIVE_PREFIX = 'Better Tasks: ';
/** register.tsx registers these at session start; this file answers them. */
export const PANE_COMMANDS = [
    { name: 'better-tasks', description: 'Show the sprint board in a pane', argumentHint: '[config]' },
];
// The values the pane draws from; the validator wants them declared in the file that uses them.
const tasksState = atom({ plugin: 'better-tasks', key: 'tasks' }, []);
const teamState = atom({ plugin: 'better-tasks', key: 'team' }, []);
const selectedState = atom({ plugin: 'better-tasks', key: 'selected' }, '');
const pageState = atom({ plugin: 'better-tasks', key: 'page' }, 'board');
const movingState = atom({ plugin: 'better-tasks', key: 'moving' }, '');
const actingState = atom({ plugin: 'better-tasks', key: 'acting' }, '');
const searchState = atom({ plugin: 'better-tasks', key: 'search' }, { isOpen: false, query: '' });
const listScrollState = atom({ plugin: 'better-tasks', key: 'listScroll' }, { start: 0, selectedId: '' });
/** The settings page turned a setting on: register.tsx sets it up (our own $.config.set reaches no hook of ours). */
const turnedOnState = atom({ plugin: 'better-tasks', key: 'turnedOn' }, { field: '', count: 0 });
/** The board's list as last drawn; the wheel moves its window from there. */
let drawnList;
// ---- With $ ----
/** The task files of the session's project, with its settings (/config, then its config.json). */
function filesOf($, options) {
    const files = {
        root: () => $.session.root(),
        now: () => $.clock.now(),
        sessionId: () => $.session.id(),
        read: path => $.fs.read(path),
        write: (path, text) => $.fs.write(path, text),
        list: path => $.fs.list(path),
        publishTasks: tasks => update($, tasksState, () => tasks),
        config: () => projectSettings(files, options),
    };
    return files;
}
async function hostOf($, editor) {
    const needsIdeaCli = editor === 'idea' || editor === 'auto';
    return {
        bundleId: await $.env.get('__CFBundleIdentifier'),
        terminalEmulator: await $.env.get('TERMINAL_EMULATOR'),
        termProgram: await $.env.get('TERM_PROGRAM'),
        hasIdeaCli: needsIdeaCli && (await $.process.run(['which', 'idea'])).exitCode === 0,
    };
}
async function openFile($, editor, file) {
    await $.process.run(openCommand(editor, file, await hostOf($, editor)));
}
/** Plays at once with the sound on in QuickTime (macOS); else opens it in the default player. */
async function playVideo($, path) {
    const played = await $.process.run(['osascript', '-e', quickTimePlay(path)]).then(done => done.exitCode === 0, () => false);
    if (!played)
        await openFile($, 'default', path);
}
/** The task's before/after video (demovideo.ts), when bin/demo-video.sh made one. */
async function videoOf($, id) {
    const folder = `${await $.session.root()}/${VIDEOS_FOLDER}`;
    const names = (await $.fs.list(folder).catch(() => [])).map(entry => entry.name);
    return names.includes(`${id}.mp4`) ? `${folder}/${id}.mp4` : undefined;
}
/** A value from the settings page: /config, or the project's config.json for a setting only a project has (the git flow). */
async function setConfig($, options, field, value) {
    if (PROJECT_KEYS.includes(field)) {
        const problem = await saveProjectValue(filesOf($, options), field, value);
        if (problem)
            $.ui.toast(`better-tasks: ${problem}`);
        else
            await update($, turnedOnState, last => ({ field, count: last.count + 1 }));
        $.ui.invalidate('ui.render');
        return;
    }
    const { deny } = await $.config.set({ key: `better-tasks.${field}`, value });
    if (!deny && value === true)
        await update($, turnedOnState, last => ({ field, count: last.count + 1 }));
}
/**
 * Enter on the selected task: the keys go to its actions. Only the task's row and the actions take
 * the ring then, so ←/→ walk the actions and ↑ from the first one comes back to the row.
 */
async function toActions($, id) {
    await update($, actingState, () => id);
    await $.ui.focus({ requestId: PANE, key: 'open' }).catch(() => undefined);
}
/** Back to the list: the actions no longer hold the keys. */
async function leaveModes($) {
    await update($, actingState, () => '');
    await update($, movingState, () => '');
}
/** Move: the task is marked moving and the ring goes back to its row, where ↑↓ now carry it. */
async function startMoving($, id) {
    await update($, actingState, () => '');
    await update($, movingState, () => id);
    await selectTask($, id);
}
/** While a task moves, ↑ lands the ring on "slot-up" and ↓ on "slot-down": one step of the task. */
async function carry($, options, movingId, element) {
    const step = element === 'slot-up' ? -1 : element === 'slot-down' ? 1 : undefined;
    if (step === undefined)
        return;
    const files = filesOf($, options);
    const settings = await settingsFrom(files);
    const sections = sectionsOf(await read($, tasksState), await today(files), settings.sprint);
    const task = sections.flatMap(section => section.tasks).find(one => one.id === movingId);
    if (task !== undefined)
        await shiftTask(files, sections, task, step, settings.sprint);
}
/** Selects the task and keeps the focus ring on it (best effort: only while the pane holds the keys). */
async function selectTask($, id) {
    if (id === undefined)
        return;
    await update($, selectedState, () => id);
    await $.ui.focus({ requestId: PANE, key: `task-${id}` }).catch(() => undefined);
}
/**
 * ⌥↑/⌥↓: one place up or down, across into the next section at an edge. Every task of the
 * section it lands in is renumbered, so the order in the files is the order on screen.
 */
async function shiftTask(files, sections, task, step, config) {
    const moved = shifted(sections, task.id, step);
    if (moved === undefined)
        return;
    const day = await today(files);
    const all = sections.flatMap(section => section.tasks);
    for (const [order, id] of moved.ids.entries()) {
        const one = all.find(candidate => candidate.id === id);
        if (one === undefined)
            continue;
        const place = id === task.id ? placeOf(moved.when, day, config) : {};
        const next = { ...one, ...place, order };
        if (next.order !== one.order || next.sprint !== one.sprint || next.urgent !== one.urgent)
            await saveTask(files, next);
    }
}
/** The files the settings page offers to open, by label, relative to the project root. */
const PROJECT_FILES = {
    'config.json': CONFIG_FILE,
    'coordinator.md': overridePath('coordinator'),
    'teammate.md': overridePath('teammate'),
    'task-template.md': overridePath('task-template'),
};
/** "This project" on the settings page: what config.json sets, its problems, the starter files. */
async function projectFacts($, files, editor) {
    const root = await files.root();
    const overrides = await readOverrides(files);
    const exists = (path) => files.read(`${root}/${path}`).then(() => true, () => false);
    const starters = Object.keys(starterFiles());
    const present = await Promise.all(starters.map(exists));
    const redraw = () => $.ui.invalidate('ui.render');
    const instructions = pathsOf(String(overrides.values.instructions ?? ''))[0];
    const prTemplate = await findPrTemplate(files, root, String(overrides.values.prTemplate ?? ''), $.plugin.root);
    /** Opens the PR template; better-tasks' own is first added to the repo, said plainly. */
    const openPrTemplate = async () => {
        if (prTemplate.source !== 'shipped')
            return openFile($, editor, prTemplate.path);
        await files.write(`${root}/${NEW_TEMPLATE}`, await files.read(prTemplate.path));
        $.ui.log(`better-tasks: added ${NEW_TEMPLATE}, the PR template every PR now fills in. Commit it to keep it.`);
        redraw();
        return openFile($, editor, `${root}/${NEW_TEMPLATE}`);
    };
    const fileAt = (label) => (label === 'instructions' ? (instructions ?? CONFIG_FILE) : (PROJECT_FILES[label] ?? CONFIG_FILE));
    /** Opens one of the project's files, writing its starter text first when it is missing. */
    const openOrCreate = async (label) => {
        const path = fileAt(label);
        const starter = starterFiles()[path];
        if (starter !== undefined && !(await exists(path)))
            await files.write(`${root}/${path}`, starter);
        redraw();
        await openFile($, editor, `${root}/${path}`);
    };
    return {
        fromProject: Object.keys(overrides.values),
        project: {
            problems: overrides.problems,
            files: Object.keys(PROJECT_FILES).map(label => ({ label, exists: present[starters.indexOf(fileAt(label))] ?? false })),
            prTemplate: { shown: shownPath(prTemplate, root), source: prTemplate.source },
            onOpen: label => void (label === 'pr-template' ? openPrTemplate() : openOrCreate(label)),
        },
    };
}
async function rememberOpen($, isOpen) {
    const root = await $.session.root();
    const open = ((await $.store.get(OPEN_KEY)) ?? {});
    await $.store.set(OPEN_KEY, { ...open, [root]: isOpen });
}
/**
 * Whether this terminal session uses the fullscreen layout, where a click on the board gives it the
 * keys. Read the way Claude Code decides it: on unless CLAUDE_CODE_NO_FLICKER=0, and off inside
 * tmux unless that variable turns it on.
 */
async function isFullscreenLayout($) {
    const noFlicker = await $.env.get('CLAUDE_CODE_NO_FLICKER');
    if (noFlicker === '0')
        return false;
    if (noFlicker === '1')
        return true;
    return (await $.env.get('TMUX')) === undefined;
}
/**
 * At start: the board comes back if it was open when this project's last session ended, but only
 * in the fullscreen layout, where a click gives it the keys. Elsewhere one line says how to open it,
 * and the flag stays for a later fullscreen session.
 */
async function reopenIfOpenBefore($, options) {
    const open = ((await $.store.get(OPEN_KEY)) ?? {});
    if (open[await $.session.root()] !== true)
        return;
    if (!(await isFullscreenLayout($))) {
        $.ui.log('better-tasks: the board was open last time: type /better-tasks');
        return;
    }
    const files = filesOf($, options);
    await listTasks(files);
    refreshTimer ??= $.clock.every(REFRESH_MS, () => void listTasks(files));
    // Opened unasked and without focus, on purpose: a person who starts typing a prompt right away
    // would otherwise send their letters to the board, where s, d and b start, finish or move tasks.
    await $.ui.open({ id: PANE, title: 'Sprint', columns: 76 });
}
/** "Week 40 · Sep 28–Oct 4", the days left added for the sprint running now. */
function sprintDetails(start, config, day) {
    const base = `${weekLabel(start, config)} · ${shortDates(start, sprintEnd(start, config))}`;
    return day === undefined ? base : `${base} · ${daysLeftLabel(day, start, config)}`;
}
async function isClosedOpen($) {
    return (await $.store.get(CLOSED_KEY)) === true;
}
async function toggleClosed($) {
    await $.store.set(CLOSED_KEY, !(await isClosedOpen($)));
    $.ui.invalidate('ui.render');
}
/** Closed tasks, the most recent sprint first. */
function closedOf(tasks) {
    return tasks.filter(task => !isOpen(task)).sort((a, b) => b.sprint.localeCompare(a.sprint) || b.id.localeCompare(a.id, undefined, { numeric: true }));
}
/**
 * After the model creates a task: the board shows it, selected, without taking the keys (the turn
 * runs on and the person may be typing). A board that is not open opens only in the fullscreen
 * layout, as at start; elsewhere one line says where to see it.
 */
async function showNewTask($, options, id) {
    await listTasks(filesOf($, options));
    await update($, selectedState, () => id);
    if ((await $.ui.panes()).some(pane => pane.id === PANE))
        return;
    if (!(await isFullscreenLayout($))) {
        $.ui.log(`better-tasks: task ${id} created · type /better-tasks to see the board`);
        return;
    }
    await leaveModes($);
    await update($, pageState, () => 'board');
    await rememberOpen($, true);
    await $.ui.open({ id: PANE, title: 'Sprint', columns: 76 });
}
/** f, or a click on "search": the box opens empty and takes the keys. */
async function openSearch($) {
    await leaveModes($);
    await update($, searchState, () => ({ isOpen: true, query: '' }));
    await $.ui.focus({ requestId: PANE, key: 'query' }).catch(() => undefined);
}
/** ✕: the box closes and the sections come back. */
async function closeSearch($) {
    await update($, searchState, () => ({ isOpen: false, query: '' }));
}
let refreshTimer;
/**
 * The wheel over the board scrolls its list, which the board windows itself, so the engine's own
 * window stays put. Only the view moves: the selection and the ring stay, even out of view, and
 * the keys bring the window back to them.
 */
async function scrollList($, list, by) {
    await update($, listScrollState, () => ({ start: wheeled(list, by), selectedId: list.selectedId }));
}
async function openPane($, options, page) {
    const files = filesOf($, options);
    await listTasks(files);
    refreshTimer ??= $.clock.every(REFRESH_MS, () => void listTasks(files));
    await update($, pageState, () => page);
    await leaveModes($);
    await rememberOpen($, true);
    await $.ui.open(PANE_OPEN);
    // The pane only takes the keys while the prompt holds them over an empty composer, which the
    // command's own run may not leave in time; ask once more right after it.
    $.clock.after(FOCUS_RETRY_MS, () => void $.ui.open(PANE_OPEN));
}
function dockTip(presentation) {
    if (!presentation.isFullscreen) {
        return ' It opened above the prompt; the fullscreen layout docks it on the right (needs 110+ columns).';
    }
    if (presentation.columns < 110)
        return ' Widen the terminal to 110+ columns to dock it on the right.';
    return '';
}
// ---- Wiring ----
export function registerPane(on, options) {
    on('command.run', { command: 'better-tasks' }, async ($, e) => {
        const page = e.args.trim() === 'config' ? 'config' : 'board';
        await openPane($, options, page);
        return { text: `Sprint board opened. If its keys do nothing, ctrl+x tab gives it the keyboard.${dockTip(e.presentation)}` };
    });
    // In Claude Code's own /config menu our rows read "Better Tasks: …", so they are easy to find.
    on('config.describe', { key: /^better-tasks\./ }, async ($, e, next) => {
        const described = await next(e);
        return described.label.startsWith(NATIVE_PREFIX) ? described : { ...described, label: NATIVE_PREFIX + described.label };
    });
    // A closed pane needs no refresh; the spinners stop with their rows.
    on('tool.call', { tool: 'mcp__better-tasks__task_create' }, async ($, e, next) => {
        const ran = await next(e);
        const id = typeof ran.result === 'string' ? ran.result.match(/^Created (\S+)/)?.[1] : undefined;
        // Showing it is a courtesy: a failure here must never fail the model's tool call.
        if (id !== undefined)
            await showNewTask($, options, id).catch(error => $.ui.log(`showing ${id} failed: ${error}`, { to: 'debug' }));
        return ran;
    });
    // The register's own session.start runs for every session; this one, with a matcher, only reopens.
    on('session.start', { isInteractive: true, surface: 'terminal' }, async ($, e, next) => {
        const started = await next(e);
        await reopenIfOpenBefore($, options);
        return started;
    });
    on('ui.close', { id: PANE }, async ($, e, next) => {
        refreshTimer?.cancel();
        refreshTimer = undefined;
        drawnList = undefined;
        await leaveModes($);
        if (e.origin.kind !== 'unload')
            await rememberOpen($, false);
        return next(e);
    });
    // Selection follows the ring. While a task moves, the person's ↑↓ carry it instead: the ring stays.
    // While its actions hold the keys, the ring coming back to the task's row leaves them.
    on('ui.focus', { requestId: PANE }, async ($, e, next) => {
        // An arrow walking past the board's first or last element would land on the engine's own stops
        // (the pane's close mark, another pane's tab) and the keys would wander off: the ring stays.
        if (e.origin.kind === 'person' && e.element === undefined)
            return { deny: 'the ring stays on the board' };
        if (e.element?.startsWith('cfg-') || e.element?.startsWith('file-')) {
            const moved = await next(e);
            if (moved.deny === undefined)
                await $.store.set(CONFIG_ROW_KEY, e.element);
            $.ui.invalidate('ui.render');
            return moved;
        }
        const movingId = await read($, movingState);
        if (movingId !== '' && e.origin.kind === 'person' && e.element !== `task-${movingId}`) {
            await carry($, options, movingId, e.element);
            return { deny: 'the moving task follows the arrows' };
        }
        const moved = await next(e);
        const id = e.element?.match(/^task-(.+)$/)?.[1];
        if (id === undefined || moved.deny !== undefined)
            return moved;
        if (e.origin.kind === 'person')
            await update($, actingState, () => '');
        await update($, selectedState, () => id);
        return moved;
    });
    // While a task moves or its actions hold the keys, the wheel leaves the list as it is.
    on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
        if (drawnList === undefined || (await read($, pageState)) !== 'board')
            return next(e);
        if ((await read($, movingState)) === '' && (await read($, actingState)) === '')
            await scrollList($, drawnList, e.by);
        return {};
    });
    on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
        const ui = $.ui.resolve(e);
        const { Box } = ui;
        const files = filesOf($, options);
        const settings = await settingsFrom(files);
        const tasks = await read($, tasksState);
        const everyone = await read($, teamState);
        const team = everyone.filter(isActive);
        const page = await read($, pageState);
        const showPage = (to) => () => void update($, pageState, () => to);
        const selectedId = await read($, selectedState);
        const movingId = await read($, movingState);
        const actingId = await read($, actingState);
        const day = await today(files);
        const current = sprintStart(day, settings.sprint);
        const goal = goalOf(await readSprints(files), current);
        const sprintsFile = `${await $.session.root()}/${settings.paths.sprints}`;
        const sections = sectionsOf(tasks, day, settings.sprint);
        const closedOpen = await isClosedOpen($);
        const closed = closedOf(tasks);
        const inSprint = tasks.filter(task => task.sprint === current && task.status !== 'cancelled');
        const doneCount = inSprint.filter(task => task.status === 'done').length;
        const open = sections.flatMap(section => section.tasks);
        const search = await read($, searchState);
        const listScroll = await read($, listScrollState);
        const whereOf = (task) => {
            if (!isOpen(task))
                return task.status === 'cancelled' ? '✗ cancelled' : '✓ closed';
            const when = whenOf(task, day, settings.sprint);
            return `${ICONS[when]} ${TITLES[when]}`;
        };
        const hits = search.isOpen && search.query.trim() !== ''
            ? searchTasks(tasks, search.query).map(hit => ({
                task: hit.task,
                where: whereOf(hit.task),
                titleMatches: hit.titleMatches,
                snippet: hit.snippet ?? '',
                snippetMatches: hit.snippetMatches ?? [],
            }))
            : undefined;
        const shown = hits ? hits.map(hit => hit.task) : closedOpen ? [...open, ...closed] : open;
        const order = shown.map(task => task.id);
        // Always a selection while there are tasks, so the box and ⌥↑/⌥↓ work from the start.
        const selectedTask = shown.find(task => task.id === selectedId) ?? shown[0];
        const selected = selectedTask && {
            task: selectedTask,
            when: isOpen(selectedTask) ? whenOf(selectedTask, day, settings.sprint) : undefined,
            mate: team.find(one => one.name === selectedTask.owner),
            isMoving: selectedTask.id === movingId,
            isActing: selectedTask.id === actingId,
            video: await videoOf($, selectedTask.id),
        };
        const sprints = {
            'this-sprint': { details: sprintDetails(current, settings.sprint, day), isLastDay: daysLeft(day, current, settings.sprint) <= 1, done: doneCount, total: inSprint.length, goal },
            'next-sprint': { details: sprintDetails(nextSprint(current, settings.sprint), settings.sprint) },
        };
        const keepFocus = (id) => () => selectTask($, id);
        const nextAfter = (id) => order[order.indexOf(id) + 1] ?? order[order.indexOf(id) - 1];
        const leave = () => leaveModes($);
        const shift = (task, step) => shiftTask(files, sections, task, step, settings.sprint).then(keepFocus(task.id));
        // Enter or a click: on the moving task stops it, on the selected one hands the keys to its
        // actions, on another selects it. Every action leaves those modes first.
        const actions = {
            pressTask: (task, isSelected) => void (task.id === movingId ? leave().then(keepFocus(task.id)) : isSelected ? toActions($, task.id) : leave().then(() => selectTask($, task.id))),
            startMoving: task => void closeSearch($).then(() => startMoving($, task.id)),
            shift: (task, step) => void shift(task, step),
            move: (task, to) => void leave().then(() => changeTask(files, task, { when: to }, settings.sprint)).then(keepFocus(task.id)),
            open: task => void leave().then(() => openFile($, settings.editor, task.file)).then(keepFocus(task.id)),
            playVideo: path => void playVideo($, path),
            start: task => void leave().then(() => $.prompt.submit({ text: startPrompt(task) })).then(keepFocus(task.id)),
            done: task => void leave().then(() => finishTask(files, task, {}, settings.sprint)).then(keepFocus(nextAfter(task.id))),
            reopen: task => void leave().then(() => changeTask(files, task, { status: 'todo', when: 'this-sprint' }, settings.sprint)).then(keepFocus(task.id)),
            toggleClosed: () => void toggleClosed($),
            openSearch: () => void openSearch($),
            setQuery: query => void update($, searchState, now => ({ isOpen: true, query: query ?? now.query })),
            closeSearch: () => void closeSearch($).then(keepFocus(selectedTask?.id)),
            showConfig: () => void leave().then(showPage('config')),
        };
        if (page === 'config') {
            return (<Box flexDirection="column" paddingX={1}>
          <ConfigPage ui={ui} settings={settings} sprintPreview={sprintLabel(current, settings.sprint)} {...await projectFacts($, files, settings.editor)} onChange={(field, value) => void setConfig($, options, field, value)} onOpenNative={() => void $.command.run({ command: 'config' })} onOpenSprints={() => void openFile($, settings.editor, sprintsFile)} focusedRow={String((await $.store.get(CONFIG_ROW_KEY)) ?? '')} onBack={showPage('board')}/>
        </Box>);
        }
        return (<Box flexDirection="column" paddingX={1}>
        <Board ui={ui} sections={sections} sprints={sprints} closed={closed} isClosedOpen={closedOpen} selected={selected} team={team} hasKeys={e.props.isFocused} bodyRows={e.props.scroll.bodyRows} scrollStart={listScroll.selectedId === selectedTask?.id ? listScroll.start : undefined} onDrawn={list => { drawnList = list; }} canSpin={e.surface === 'terminal' || e.surface === 'desktop'} search={search} hits={hits} actions={actions}/>
      </Box>);
    });
}
