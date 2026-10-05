import { warmthOf } from './cache';
// Teammates: who they are, how full their context is, whether their prompt cache is warm, and whom a successor takes over from.
const ENDED = ['completed', 'failed', 'killed'];
export const contextTokens = (usage) => usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens;
export const isActive = (mate) => !ENDED.includes(mate.status);
export function percentOf(tokens, window) {
    return tokens === undefined || window <= 0 ? undefined : Math.round((tokens / window) * 100);
}
/** The named agents of the session: context fill, what they do now, and their cache warmth. */
export function teamOf(agents, tokens, window, activities = {}, cache) {
    return agents
        .filter(agent => agent.name !== undefined || agent.type === 'teammate')
        .map(agent => {
        const warmth = cache && warmthOf(cache.steps[agent.id], cache.now, cache.ttl);
        return {
            id: agent.id,
            name: agent.name ?? agent.description,
            status: agent.status,
            percent: percentOf(tokens[agent.id], window),
            activity: activities[agent.id]?.text,
            activeAt: activities[agent.id]?.at,
            cache: warmth?.cache,
            cacheMinutesLeft: warmth?.minutesLeft,
        };
    });
}
export async function refreshTeam(io) {
    const cache = { steps: await io.cacheSteps(), now: await io.now(), ttl: await io.cacheTtl() };
    const team = teamOf(await io.agents(), await io.tokens(), await io.window(), await io.activities(), cache);
    await io.publishTeam(team);
    return team;
}
/** The teammate a SendMessage `to` names (a name, "name [ref]" or an agent id). */
export function findMate(team, to) {
    const name = to.replace(/\s*\[.*\]$/, '').trim();
    return team.find(mate => mate.name === name || mate.id === name);
}
/** The teammate a successor ("login-2") takes over from: the newest other one of its area. */
export function predecessorOf(team, name) {
    const area = areaOf(name);
    if (area === name)
        return undefined;
    return team.findLast(mate => mate.name !== name && areaOf(mate.name) === area);
}
const areaOf = (name) => name.replace(/-\d+$/, '');
/** "idle" for a running teammate between turns, "working" during one. */
export function stateOf(mate) {
    if (mate.status !== 'running')
        return mate.status;
    return mate.activity ? 'working' : 'idle';
}
export function cacheText(mate) {
    if (mate.cache === 'warm')
        return `cache warm ${mate.cacheMinutesLeft}m`;
    return mate.cache === 'cold' ? 'cache cold' : undefined;
}
export function mateLine(mate) {
    const fill = mate.percent === undefined ? 'context ?' : `context ${mate.percent} %`;
    return [mate.name, stateOf(mate), fill, cacheText(mate), mate.activity].filter(Boolean).join(' · ');
}
