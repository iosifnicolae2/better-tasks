// The instruction templates (.claude/better-tasks/*.md) as one TypeScript object, for the tests' fake engine:
// `claude plugin test` gives a test no fs and loads only code, so the tests can't read the .md files themselves.
// scripts/test.sh writes it to tests/templates.gen.ts (git-ignored) before each run. The plugin reads the .md files.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const root = new URL('..', import.meta.url).pathname

export function templatesModule(): string {
  const folder = `${root}.claude/better-tasks`
  const files = Object.fromEntries(readdirSync(folder).filter(name => name.endsWith('.md')).sort().map(name => [name, readFileSync(`${folder}/${name}`, 'utf8')]))
  return `// Written by scripts/test.sh from .claude/better-tasks/: don't edit it or commit it.\nexport const TEMPLATES: Record<string, string> = ${JSON.stringify(files, null, 2)}\n`
}

export function writeTemplates(path = `${root}tests/templates.gen.ts`): void {
  writeFileSync(path, templatesModule())
}

if (import.meta.main) writeTemplates()
