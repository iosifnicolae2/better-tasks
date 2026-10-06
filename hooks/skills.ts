// The plugin's skills (skills/<name>/SKILL.md): how-tos loaded when their step comes, instead of rules
// pasted into every prompt. A SKILL.md holds its name and description; when one loads, register.tsx's
// skill.prompt hook puts in its text: the template .claude/better-tasks/<name>.md, rendered with the settings in force.

/** Our skills that follow settings, by folder name; the model calls them better-tasks:<name>. */
export type SkillName = 'video' | 'testing' | 'done' | 'contribute' | 'pull-request' | 'tester'

const PLUGIN = 'better-tasks'
const SKILLS: readonly SkillName[] = ['video', 'testing', 'done', 'contribute', 'pull-request', 'tester']

/** The name as the model calls it. */
export const skillCall = (name: SkillName) => `${PLUGIN}:${name}`

/** Which of our skills a skill.prompt event is about: "better-tasks:video" (or a bare "video"). */
export function ourSkill(skill: string): SkillName | undefined {
  const name = skill.startsWith(`${PLUGIN}:`) ? skill.slice(PLUGIN.length + 1) : skill
  return SKILLS.find(own => own === name)
}
