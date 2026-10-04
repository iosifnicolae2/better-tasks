import type { ModelChoice, TeammateModels } from './settings'

// Which model and effort a teammate runs on (settings teammateModel, teammateEffort, hardModel, hardEffort, escalate).
// A spawn can set a model but not an effort, so the mod registers two agent types, each with its model and effort
// from the settings (register.tsx does it); the lead picks the type, never the model.

export const TEAMMATE_TYPE = 'better-tasks:teammate'
export const HARD_TYPE = 'better-tasks:teammate-hard'

/** What `$.agent.register` takes; the type is `better-tasks:<name>`. */
export type TeammateType = { name: string; description: string; prompt: string; model: string; effort: string }

const PROMPT = 'You are a better-tasks teammate. Your prompt names your task file and your area: follow it and the rules below it.'

/** "sonnet at xhigh effort"; inherit reads as the manager's own model. */
export function describeChoice({ model, effort }: ModelChoice): string {
  return `${model === 'inherit' ? "the manager's own model" : model} at ${effort} effort`
}

/** The two agent types the settings describe: for easy and normal tasks, and for hard ones. */
export function teammateTypes(models: TeammateModels): TeammateType[] {
  const agentType = (name: string, when: string, choice: ModelChoice) => ({
    name,
    description: `A better-tasks teammate (${describeChoice(choice)}) for ${when}.`,
    prompt: PROMPT,
    ...choice,
  })
  return [
    agentType('teammate', 'easy and normal tasks', models.normal),
    agentType('teammate-hard', 'hard tasks and for a teammate that got stuck', models.hard),
  ]
}

/** What the lead reads about picking a teammate's model and effort, from the settings. */
export function leadModelRules(models: TeammateModels): string {
  const escalation = models.escalate
    ? `- A teammate that is not reaching the goal (it fails, says it is stuck, goes in circles, or the user asks for the same fix twice): its successor ("login-2") gets \`${HARD_TYPE}\`, so a stronger model takes over. A plain handover (high context, cold cache) keeps the type.`
    : '- Escalation is off: a successor keeps its predecessor\'s type, even when it was stuck.'
  return `## Teammate models (settings)
Pick it with the spawn's subagent_type, which sets model and effort; never pass \`model\`.
- Easy and normal tasks, and when unsure: \`${TEAMMATE_TYPE}\` (${describeChoice(models.normal)}).
- Hard tasks (deep debugging, security work, changes across several areas): \`${HARD_TYPE}\` (${describeChoice(models.hard)}).
${escalation}`
}

/** What a teammate on the default type reads: report being stuck, so the lead can escalate. */
export const STUCK_RULE = `## Stuck?
Not reaching the goal after real attempts, or going in circles? Stop: write what you tried in the task file's notes and tell the lead in one line. It may hand the task to a stronger teammate.`

/** The settings-driven rules for a teammate's spawn prompt: only the default type, only while escalation is on. */
export function teammateModelRules(models: TeammateModels, type: string | undefined): string {
  return models.escalate && type !== HARD_TYPE ? STUCK_RULE : ''
}
