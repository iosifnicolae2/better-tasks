import type { Files } from './io'
import { CONFIG_FILE, DEFAULTS } from './settings'
import { OVERRIDE_DIR } from './template'

// The task template and the tips the mod ships, and the project's markdown overrides of them in .claude/tasks/.
// An override replaces the shipped text, or extends it when its first line is EXTEND.
// HTML comments in an override are notes for people and never reach the model.
// The instructions (the lead's and teammates' rules, the skills) are templates in .claude/better-tasks/: rules.ts.

export const OVERRIDES_DIR = '.claude/tasks'
export const EXTEND = '<!-- extend -->'

export type TextName = 'task-template' | 'tips'

const TASK_TEMPLATE = `## Goal
{goal}

## Notes
`

const TIPS = `/better-tasks: the board · ↑↓: select  ⏎: actions  f: search  c: settings
"fix the login redirect": a task, started now · "… next sprint" or "… backlog": planned, not started
/away: screens off, Mac keeps working`

export const SHIPPED: Record<TextName, string> = {
  'task-template': TASK_TEMPLATE,
  tips: TIPS,
}

const COMMENTS = /<!--[\s\S]*?-->/g

/** The text in force: the shipped one, replaced or extended by the project's override. */
export function resolveText(shipped: string, override: string | undefined): string {
  if (override === undefined) return shipped
  const isExtending = override.trimStart().startsWith(EXTEND)
  const own = override.replace(COMMENTS, '').trim()
  if (!isExtending) return own
  return own ? `${shipped.trimEnd()}\n\n${own}` : shipped
}

/** Fills {name} placeholders; unknown ones stay as written. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole)
}

export function overridePath(name: TextName): string {
  return `${OVERRIDES_DIR}/${name}.md`
}

export async function projectText(files: Files, name: TextName): Promise<string> {
  const override = await files.read(`${await files.root()}/${overridePath(name)}`).catch(() => undefined)
  return resolveText(SHIPPED[name], override)
}

// ---- Starter files: what /better-tasks init (or the project_init tool) writes ----

function starterConfig(): string {
  const lines = Object.entries(DEFAULTS).map(([key, value]) => `  "// ${key}": ${JSON.stringify(value)}`)
  const note =
    '  "//": "better-tasks settings for this project. Remove the // in front of a key to set it here; ' +
    'keys left out come from /config or the defaults. {id}, {slug} and {title} work in taskFileName."'
  return `{\n${[note, ...lines].join(',\n')}\n}\n`
}

function starterText(name: TextName): string {
  const shipped = SHIPPED[name].replace(/-->/g, '--&gt;')
  return (
    `${EXTEND}\n` +
    `<!-- What you write below is added to better-tasks' own ${name} text. Delete the first line to replace ` +
    'that text instead. Comments like this one never reach the model. The shipped text, for reference:\n\n' +
    `${shipped}\n-->\n`
  )
}

/** An instruction override that changes nothing until written in: it says how to extend or replace. */
function starterRule(name: string): string {
  return (
    `<!-- What you write below is added after better-tasks' own ${name}. To replace it instead, start this file with\n` +
    `---\nreplace: true\n---\nOn a line of its own, @/${name} pulls in better-tasks' text and @./<path> a file of this project.\n` +
    'Settings work as in the shipped file: {% if gitFlow == "direct" %} … {% endif %}, {{ devBranch }}. Comments like this one never reach the model. -->\n'
  )
}

/** Every starter file, by its path relative to the project root. */
export function starterFiles(): Record<string, string> {
  const texts = Object.keys(SHIPPED).map(name => [overridePath(name as TextName), starterText(name as TextName)])
  const rules = ['lead.md', 'teammate.md'].map(name => [`${OVERRIDE_DIR}/${name}`, starterRule(name)])
  return Object.fromEntries([[CONFIG_FILE, starterConfig()], ...rules, ...texts])
}

/** Writes the starter files the project does not have yet; returns the paths written. */
export async function initProject(files: Files): Promise<string[]> {
  const root = await files.root()
  const written: string[] = []
  for (const [path, text] of Object.entries(starterFiles())) {
    const exists = await files.read(`${root}/${path}`).then(() => true, () => false)
    if (exists) continue
    await files.write(`${root}/${path}`, text)
    written.push(path)
  }
  return written
}
