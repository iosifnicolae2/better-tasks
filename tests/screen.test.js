import { expect, mock, test } from 'claude-code/testing';
import { holdIsDue } from '../hooks/screen';
const AWAY = {
    command: 'away',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 80 },
};
/** Answers the engine's side; records every command the plugin starts. */
function fakeHost(on, awaySays = 'black') {
    const spawned = [];
    on('state.set', () => ({ value: { isSet: true, version: 1 } }));
    on('state.get', () => ({ value: { value: [], version: 0 } }));
    on('process.run', ($, e) => {
        spawned.push([...e.argv]);
        const stdout = e.argv[1]?.endsWith('/bin/away.sh') ? awaySays : '';
        return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } };
    });
    on('process.spawn', async function* ($, e) {
        spawned.push([...e.argv]);
        return { value: { code: 0, signal: null } };
    });
    return spawned;
}
const team = (...statuses) => statuses.map((status, i) => ({ id: `a${i}`, name: `mate-${i}`, status }));
const caffeinates = (spawned) => spawned.filter(argv => argv[0] === 'caffeinate');
const isAway = (argv) => argv[0] === '/bin/sh' && /\/bin\/away\.sh$/.test(argv[1] ?? '');
test('/away starts the detached blackout', async ($, on) => {
    const spawned = fakeHost(on);
    const { text } = await $.command.run(AWAY);
    expect(text).toContain('Screens are black');
    expect(spawned.filter(isAway)).toHaveLength(1);
});
test('the screen_off tool does what /away does', async ($, on) => {
    const spawned = fakeHost(on);
    await $.tool.call({ tool: 'mcp__better-tasks__screen_off', tool_use_id: 't1' });
    expect(spawned.filter(isAway)).toHaveLength(1);
});
test('when the blackout fails, the displays sleep instead', async ($, on) => {
    const spawned = fakeHost(on, 'failed: no answer in 5 s');
    const { text } = await $.command.run(AWAY);
    expect(text).toContain('may lock');
    expect(spawned).toContainEqual(['pmset', 'displaysleepnow']);
});
test('keepAwake: a hold is due while someone runs, at most every 30 s', () => {
    const due = (keepAwake, mates, now, heldAt = -Infinity) => holdIsDue({ keepAwake, team: mates, now, heldAt });
    expect(due(true, team('running', 'completed'), 0)).toBe(true);
    expect(due(true, team('completed', 'failed', 'killed'), 0)).toBe(false);
    expect(due(true, [], 0)).toBe(false);
    expect(due(false, team('running'), 0)).toBe(false);
    expect(due(true, team('running'), 29_999, 0)).toBe(false);
    expect(due(true, team('running'), 30_000, 0)).toBe(true);
});
test('keepAwake: publishing a running team starts caffeinate', async ($, on) => {
    mock.clock(on);
    mock.store(on);
    mock.env(on, { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' });
    const spawned = fakeHost(on);
    on('settings.read', () => ({ value: { env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' } } }));
    on('session.start', ($, e) => ({ cwd: e.cwd }));
    on('session.root', () => ({ value: '/project' }));
    on('session.id', () => ({ value: 'lead' }));
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000, percent: 10 }, rateLimits: [] } }));
    on('agent.list', () => ({ value: [{ id: 'a1', name: 'ui', description: 'ui', type: 'teammate', status: 'running' }] }));
    on('tool.register', ($, e) => ({ value: { tool: `mcp__better-tasks__${e.name}` } }));
    on('command.register', ($, e) => ({ value: { command: e.name } }));
    on('ui.status', () => ({ value: undefined }));
    on('ui.toast', () => ({ value: undefined }));
    on('fs.read', ($, e) => { throw new Error(`ENOENT ${e.path}`); });
    on('fs.write', () => ({ value: undefined }));
    on('fs.list', () => ({ value: [] }));
    await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true });
    expect(caffeinates(spawned)).toEqual([['caffeinate', '-i', '-s', '-t', '120']]);
});
