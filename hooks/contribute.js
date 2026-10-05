import { skillCall } from './skills';
// Changes to better-tasks itself: made in the user's fork, run as a linked install, offered upstream as a PR.
// The user's answer to "open a PR upstream?" is kept per user, in <claude config dir>/better-tasks/user.json,
// outside the plugin's options: the linked fork runs under another plugin id, and the answer must reach both.
export const UPSTREAM_REPO = 'iosifnicolae2/better-tasks';
/** The answers to the question, as the tool takes them. */
export const UPSTREAM_ANSWERS = ['yes', 'not-now', 'never', 'ask'];
export function userFile(claudeDir) {
    return `${claudeDir}/better-tasks/user.json`;
}
function parseUser(text) {
    try {
        const json = JSON.parse(text ?? '{}');
        return typeof json === 'object' && json !== null && !Array.isArray(json) ? json : {};
    }
    catch {
        return {};
    }
}
export function upstreamPrOf(text) {
    return parseUser(text).upstreamPr === 'never' ? 'never' : 'ask';
}
export async function readUpstreamPr(files, claudeDir) {
    return upstreamPrOf(await files.read(userFile(claudeDir)).catch(() => undefined));
}
/** Saves the answer (only "never" sticks; the rest mean ask next time), keeping the file's other keys. */
export async function saveUpstreamPr(files, claudeDir, given) {
    const answer = UPSTREAM_ANSWERS.find(known => known === given) ?? 'ask';
    const path = userFile(claudeDir);
    const user = parseUser(await files.read(path).catch(() => undefined));
    const choice = answer === 'never' ? 'never' : 'ask';
    await files.write(path, `${JSON.stringify({ ...user, upstreamPr: choice }, null, 2)}\n`);
    return ANSWER_REPLIES[answer];
}
const ANSWER_REPLIES = {
    yes: `Saved. Open the PR now: push the fork's branch, then gh pr create --repo ${UPSTREAM_REPO}. Asked again after the next change.`,
    'not-now': 'Saved: no PR now; asked again after the next change to better-tasks.',
    never: 'Saved: never asked again. The user can undo it by asking for it (upstream_pr with answer ask).',
    ask: 'Saved: asked again after the next change to better-tasks.',
};
export const UPSTREAM_PR_TOOL = {
    name: 'upstream_pr',
    description: 'Saves the user\'s answer to "open a PR to the better-tasks repo?", asked after a change to better-tasks itself ' +
        `(see the ${skillCall('contribute')} skill). yes or not-now: asked again next time; never: not asked again; ` +
        'ask: undoes a never. Kept per user, for every project.',
    inputSchema: {
        type: 'object',
        properties: { answer: { type: 'string', enum: [...UPSTREAM_ANSWERS] } },
        required: ['answer'],
    },
};
/** The lead's prompt keeps one pointer; the steps are the contribute skill (skills/contribute). */
export const CONTRIBUTE_POINTER = `## Changes to better-tasks itself
The user wants better-tasks (this plugin) changed: load the \`${skillCall('contribute')}\` skill before you file it.`;
/** What the contribute skill reads under its title: its step 4, which follows the user's saved answer. */
export function contributeSkillSettings(choice) {
    return choice === 'never'
        ? '- Upstream PR: never. No PR question: the user chose "Never" (upstream_pr answer ask undoes it, only when the user asks).'
        : '- Upstream PR: ask. Ask with AskUserQuestion, header "PR upstream", "Open a PR to the better-tasks repo?", ' +
            `options "Yes, open a PR" (push the branch, \`gh pr create --repo ${UPSTREAM_REPO}\`), ` +
            '"Not now" (asked again next time), "Never" (not asked again).';
}
