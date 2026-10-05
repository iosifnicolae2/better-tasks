import { expect, mock, test } from 'claude-code/testing';
const ROOT = '/demo';
const DIR = `${ROOT}/.claude/tasks`;
const WEDNESDAY = new Date(2026, 9, 7, 12).getTime();
const COLUMNS = 62;
const ROWS = 30;
const PANE = {
    component: 'Pane',
    requestId: 'better-tasks-sprint',
    props: { title: 'Sprint', isFocused: true, bodyColumns: COLUMNS, placement: 'dock', scroll: { offset: 0, bodyRows: ROWS }, view: {} },
};
const TASKS = [
    { id: 'T-007', title: 'Login loops after password reset', sprint: '2026-10-05', status: 'doing', owner: 'auth', urgent: true },
    { id: 'T-001', title: 'Fix the login redirect', sprint: '2026-10-05', status: 'todo', rolled: 1 },
    { id: 'T-004', title: 'Rate-limit the public API', sprint: '2026-10-05', status: 'todo' },
    { id: 'T-006', title: 'Session timeout banner', sprint: '2026-10-05', status: 'done' },
    { id: 'T-009', title: 'Dark mode for settings', sprint: '2026-10-12', status: 'todo' },
    { id: 'T-002', title: 'Billing export as CSV', sprint: 'backlog', status: 'todo' },
    { id: 'T-005', title: 'Onboarding emails', sprint: 'backlog', status: 'todo' },
];
function taskFile(spec, order) {
    return [
        '---',
        `id: ${spec.id}`,
        `title: ${spec.title}`,
        `sprint: ${spec.sprint}`,
        `urgent: ${spec.urgent === true}`,
        `status: ${spec.status}`,
        `owner: ${spec.owner ?? ''}`,
        `rolled: ${spec.rolled ?? 0}`,
        `order: ${order}`,
        'created: 2026-10-01',
        '---',
        '## Goal\n\n## Notes\n',
    ].join('\n');
}
/** The demo project, a running teammate "auth" at 63 % editing auth.ts, and a session to look into. */
async function demo($, on) {
    const files = new Map(TASKS.map((spec, order) => [`${DIR}/${spec.id}.md`, taskFile(spec, order)]));
    files.set(`${ROOT}/.claude/tasks/sprints.md`, '# Sprints\n\n## 2026-10-05 · Sprint 41\nGoal: Ship the new login flow\n');
    mock.clock(on, { now: WEDNESDAY });
    mock.store(on);
    mock.env(on, { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1', CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL: '1h' });
    on('settings.read', () => ({ value: { env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' } } }));
    on('session.root', () => ({ value: ROOT }));
    on('session.id', () => ({ value: 'demo' }));
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000, percent: 10 }, rateLimits: [] } }));
    on('agent.list', () => ({ value: [{ id: 'a1', name: 'auth', description: 'auth', type: 'teammate', status: 'running' }] }));
    on('fs.list', ($, e) => ({
        value: [...files.keys()]
            .filter(path => path.startsWith(`${e.path}/`))
            .map(path => ({ name: path.slice(e.path.length + 1), kind: 'file', size: 0, mtimeMs: 0, isLink: false })),
    }));
    on('fs.read', ($, e) => (files.has(e.path) ? { value: files.get(e.path) ?? '' } : { deny: `ENOENT ${e.path}` }));
    on('fs.write', ($, e) => {
        files.set(e.path, e.text);
        return { value: undefined };
    });
    on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }));
    on('ui.open', () => ({ value: { isPlaced: true } }));
    on('ui.focus', () => ({}));
    on('ui.log', () => ({ value: undefined }));
    on('tool.call', { tool: 'Edit' }, () => ({ result: 'edited' }));
    on('turn.step', async function* ($, e) {
        const usage = { input_tokens: 330, output_tokens: 1, cache_read_input_tokens: 200, cache_creation_input_tokens: 100, model: "m" };
        return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage };
    });
    await $.command.run({ command: 'better-tasks', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } });
    for await (const chunk of $.turn.step({ turnId: 't', index: 0, model: 'm', messageCount: 1, agentId: 'a1' }))
        void chunk;
    await $.tool.call({ tool: 'Edit', tool_use_id: 'e1', agentId: 'a1', file_path: '/demo/src/auth.ts', old_string: 'a', new_string: 'b' });
}
const arrowTo = ($, element) => $.ui.focus({ component: 'Pane', requestId: 'better-tasks-sprint', plugin: 'better-tasks', element, origin: { kind: 'person' } });
async function shoot(name, ui, focus) {
    const tree = await ui.drawn();
    expect(tree).toBeDefined();
    console.log(`SCREENSHOT ${JSON.stringify({ name, focus, columns: COLUMNS + 2, tree })}`);
}
test('screenshot: the board', async ($, on) => {
    await demo($, on);
    const ui = await $.ui.mount({ plugin: 'better-tasks', surface: 'terminal', ...PANE });
    await shoot('board', ui, 'task-T-007');
});
test('screenshot: actions', async ($, on) => {
    await demo($, on);
    const ui = await $.ui.mount({ plugin: 'better-tasks', surface: 'terminal', ...PANE });
    await ui.press({ key: 'task-T-001' });
    await ui.press({ key: 'task-T-001' });
    await shoot('actions', ui, 'start');
});
test('screenshot: moving', async ($, on) => {
    await demo($, on);
    const ui = await $.ui.mount({ plugin: 'better-tasks', surface: 'terminal', ...PANE });
    await ui.press({ key: 'task-T-004' });
    await ui.press({ key: 'task-T-004' });
    await ui.press({ key: 'move' });
    await arrowTo($, 'slot-up');
    await shoot('moving', ui, 'task-T-004');
});
test('screenshot: settings', async ($, on) => {
    await demo($, on);
    const ui = await $.ui.mount({ plugin: 'better-tasks', surface: 'terminal', ...PANE });
    await ui.press({ key: 'config' });
    await arrowTo($, 'cfg-longCache');
    await shoot('settings', ui, 'cfg-longCache');
});
