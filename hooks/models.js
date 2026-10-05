import { LEVELS } from './settings';
// Which model and effort a teammate runs on: one per level of task, from the settings (easyModel, easyEffort,
// normalModel, …, escalate). A spawn can set a model but not an effort, so the mod registers one agent type per
// level, each with its model and effort (register.tsx does it); the lead picks the type, never the model.
const PLUGIN = 'better-tasks';
const nameOf = (level) => `teammate-${level}`;
/** The agent type of a level: "better-tasks:teammate-easy". */
export const typeOf = (level) => `${PLUGIN}:${nameOf(level)}`;
/** The type of a named spawn the lead gave none. */
export const DEFAULT_TYPE = typeOf('normal');
const PROMPT = 'You are a better-tasks teammate. Your prompt names your task file and your area: follow it and the rules below it.';
const ABOUT = {
    easy: { tasks: 'Easy tasks', examples: 'quick, clear work: a typo, a text, a small fix' },
    normal: { tasks: 'Normal tasks', examples: 'an ordinary feature or bug fix' },
    hard: { tasks: 'Hard tasks', examples: 'deep debugging, security work, changes across several areas' },
};
/** "sonnet at xhigh effort"; inherit reads as the manager's own model. */
export function describeChoice({ model, effort }) {
    return `${model === 'inherit' ? "the manager's own model" : model} at ${effort} effort`;
}
/** One agent type per level, with its model and effort. */
export function teammateTypes(models) {
    return LEVELS.map(level => ({
        name: nameOf(level),
        description: `A better-tasks teammate (${describeChoice(models[level])}) for ${ABOUT[level].tasks.toLowerCase()}: ${ABOUT[level].examples}.`,
        prompt: PROMPT,
        ...models[level],
    }));
}
/** What the lead reads about picking a teammate's model and effort, from the settings. */
export function leadModelRules(models) {
    const escalation = models.escalate
        ? `- A teammate that is not reaching the goal (it fails, says it is stuck, goes in circles, or the user asks for the same fix twice): its successor ("login-2") moves one level up, easy to \`${typeOf('normal')}\`, normal to \`${typeOf('hard')}\`. A hard one stays hard: ask the user how to go on. A plain handover (high context, cold cache) keeps the type.`
        : "- Escalation is off: a successor keeps its predecessor's type, even when it was stuck.";
    return `## Teammate models (settings)
Pick it with the spawn's subagent_type, which sets model and effort; never pass \`model\`.
${LEVELS.map(level => `- ${ABOUT[level].tasks} (${ABOUT[level].examples}): \`${typeOf(level)}\`, ${describeChoice(models[level])}.`).join('\n')}
- Unsure: normal.
${escalation}`;
}
/** What a teammate below the hard level reads: report being stuck, so the lead can move the task up. */
export const STUCK_RULE = `## Stuck?
Not reaching the goal after real attempts, or going in circles? Stop: write what you tried in the task file's notes and tell the lead in one line. It may hand the task to a stronger teammate.`;
/** The settings-driven rules for a teammate's spawn prompt: only below the hard level, only while escalation is on. */
export function teammateModelRules(models, type) {
    return models.escalate && type !== typeOf('hard') ? STUCK_RULE : '';
}
