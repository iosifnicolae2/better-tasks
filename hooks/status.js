// The status check: after a quiet spell, the coordinator is asked to move the open work forward.
const MAX_MINUTES = 60;
const MINUTE = 60_000;
export const NO_CHECK = { activeAt: 0, checkedAt: 0, fingerprint: '', quiet: 0, busy: false };
/** Minutes to wait: the setting, doubled from the second quiet check on, at most an hour. */
export function waitMinutes(every, quiet) {
    return Math.min(MAX_MINUTES, every * 2 ** Math.max(0, quiet - 1));
}
/** The open work, the teammates and the tasks resolved but still open, as one comparable string: a change means there is something new to look at. */
export function fingerprintOf(tasks, team, unclosed = []) {
    const work = tasks.map(task => `${task.id}:${task.status}:${task.owner}:${task.body.length}`);
    const mates = team.map(mate => `${mate.name}:${mate.status}:${mate.activity ?? ''}`);
    return [...work, ...mates, ...unclosed.map(id => `resolved:${id}`)].join('|');
}
/** Whether to ask for a status check now, and the check record afterwards. */
export function statusDecision(facts) {
    const { now, every, check } = facts;
    const isBlocked = every <= 0 || check.busy || facts.composerText.trim() !== '' || !facts.hasWork;
    const idleSince = Math.max(check.activeAt, check.checkedAt);
    if (isBlocked || now - idleSince < waitMinutes(every, check.quiet) * MINUTE)
        return { fire: false, check };
    if (facts.fingerprint === check.fingerprint)
        return { fire: false, check: { ...check, checkedAt: now, quiet: check.quiet + 1 } };
    return { fire: true, check: { ...check, checkedAt: now, quiet: 0, fingerprint: facts.fingerprint } };
}
/** The prompt the coordinator gets. */
export function statusPrompt(idleMinutes) {
    return (`better-tasks status check: no activity for ${idleMinutes} min. Move the work forward.\n` +
        '1. Call team_status.\n' +
        '2. For each task currently working on or in this sprint, act:\n' +
        '   - the user marked it resolved but it is still open: close it now (task_update status done, summary, commits), stop the teammate;\n' +
        '   - teammate working: leave it;\n' +
        '   - teammate reported done: read its task file notes, then ask the user to test it (the Finishing question);\n' +
        '   - teammate idle but the task still open: check whether the work is done; if not, tell it to go on;\n' +
        '   - stuck (an error, going in circles): unblock it with SendMessage (a line or two, a file path for the rest), or a fresh teammate by the routing rules;\n' +
        '   - waiting for the user: one short AskUserQuestion, only if it truly blocks;\n' +
        '   - nothing running and the user said go: start the next this-sprint task.\n' +
        '3. Then tell the user in 3–5 short lines: what moved, what is blocked and on whom, what is next. Nothing new since the last report: one line.');
}
