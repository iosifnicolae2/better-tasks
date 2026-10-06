// Checks the skills in skills/: each one the hooks point at exists, loads by its name, stays out of the slash
// menu, and has its template in .claude/better-tasks/ (the hooks put the rendered template in when it loads).
// (The test runner can't read files, so this does.) Run: `bun scripts/skills-check.ts`; exits 1 and names what is missing.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('..', import.meta.url).pathname
const SKILLS = ['video', 'testing', 'done', 'contribute', 'pull-request']

const problems: string[] = []
for (const name of SKILLS) {
  const path = `${root}skills/${name}/SKILL.md`
  if (!existsSync(path)) {
    problems.push(`${name}: no ${path}`)
    continue
  }
  const text = readFileSync(path, 'utf8')
  if (!text.startsWith(`---\nname: ${name}\nuser-invocable: false\ndescription: `)) problems.push(`${name}: front matter (name, user-invocable: false, description)`)
  if (!existsSync(`${root}.claude/better-tasks/${name}.md`)) problems.push(`${name}: no template .claude/better-tasks/${name}.md`)
}

if (problems.length > 0) {
  console.error(`skills-check:\n${problems.map(problem => `- ${problem}`).join('\n')}`)
  process.exit(1)
}
console.log(`skills-check: ${SKILLS.length} skills, each with its template`)
