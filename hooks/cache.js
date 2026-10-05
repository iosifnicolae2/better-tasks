const isTtl = (value) => value === '5m' || value === '1h';
/** The TTL Claude Code uses for requests outside the main conversation (teammates, subagents), in its own order. */
export function subagentTtl(sources) {
    if (sources.force5mEnv === '1')
        return '5m';
    if (isTtl(sources.subagentEnv))
        return sources.subagentEnv;
    if (isTtl(sources.subagentSetting))
        return sources.subagentSetting;
    return sources.oneHourEnv === '1' ? '1h' : '5m';
}
const MINUTE = 60_000;
/** Minutes a cache is trusted: the TTL less a margin, so a request planned now still lands in time. */
export function trustedMinutes(ttl) {
    return ttl === '1h' ? 55 : 4;
}
/** Warm while the last request is younger than the trusted minutes and it used the cache; undefined before any request. */
export function warmthOf(step, now, ttl) {
    if (step === undefined)
        return undefined;
    const left = Math.floor(trustedMinutes(ttl) - (now - step.at) / MINUTE);
    const usedCache = step.read + step.created > 0;
    return left > 0 && usedCache ? { cache: 'warm', minutesLeft: left } : { cache: 'cold', minutesLeft: 0 };
}
