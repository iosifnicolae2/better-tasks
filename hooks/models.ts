import { LEVELS } from './settings'
import type { Level, ModelChoice, TeammateModels } from './settings'

// Which model and effort a teammate runs on: one per level of task, from the settings (easyModel, easyEffort,
// normalModel, …, escalate). A spawn can set a model but not an effort, so the mod registers one agent type per
// level, each with its model and effort (register.tsx does it); the lead picks the type, never the model.

const PLUGIN = 'better-tasks'

const nameOf = (level: Level) => `teammate-${level}`

/** The agent type of a level: "better-tasks:teammate-easy". */
export const typeOf = (level: Level) => `${PLUGIN}:${nameOf(level)}`

/** The type of a named spawn the lead gave none. */
export const DEFAULT_TYPE = typeOf('normal')

/** What `$.agent.register` takes; the type is `better-tasks:<name>`. */
export type TeammateType = { name: string; description: string; prompt: string; model: string; effort: string }

const PROMPT = 'You are a better-tasks teammate. Your prompt names your task file and your area: follow it and the rules below it.'

const ABOUT: Record<Level, { tasks: string; examples: string }> = {
  easy: { tasks: 'Easy tasks', examples: 'quick, clear work: a typo, a text, a small fix' },
  normal: { tasks: 'Normal tasks', examples: 'an ordinary feature or bug fix' },
  hard: { tasks: 'Hard tasks', examples: 'deep debugging, security work, changes across several areas' },
}

/** "sonnet at xhigh effort"; inherit reads as the lead's own model. */
export function describeChoice({ model, effort }: ModelChoice): string {
  return `${model === 'inherit' ? "the lead's own model" : model} at ${effort} effort`
}

/** One agent type per level, with its model and effort. */
export function teammateTypes(models: TeammateModels): TeammateType[] {
  return LEVELS.map(level => ({
    name: nameOf(level),
    description: `A better-tasks teammate (${describeChoice(models[level])}) for ${ABOUT[level].tasks.toLowerCase()}: ${ABOUT[level].examples}.`,
    prompt: PROMPT,
    ...models[level],
  }))
}
