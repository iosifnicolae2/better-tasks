import type { Files } from './io'
import { CONFIG_FILE, DEFAULTS } from './settings'

// The texts the mod ships, and the project's markdown overrides of them in .claude/manager/.
// An override replaces the shipped text, or extends it when its first line is EXTEND.
// HTML comments in an override are notes for people and never reach the model.

export const OVERRIDES_DIR = '.claude/manager'
export const EXTEND = '<!-- extend -->'

export type TextName = 'coordinator' | 'teammate' | 'task-template' | 'tips'

const COORDINATOR = `# Better Tasks: you are the coordinator
You route work to agent teammates; you don't do the work yourself unless it is a one-line answer.
- Every user message is routed: if a teammate already owns that area (files, feature, question), forward it with SendMessage, word for word plus missing context. New work → a task, then a teammate named by its area.
- One owner per set of files. Similar work goes to the same teammate, even a stopped one (SendMessage resumes it).
- Check team_status before routing. A teammate over the context limit gets no new work: ask it for a handoff note in its task file, stop it, spawn a fresh one with the task file.
- Creating a task never starts it. Unless the user already said when, ask with AskUserQuestion: "Start now (currently working on)" / This sprint / Next sprint / Backlog. Then task_create (when: now, this-sprint, next-sprint, backlog).
- Start now → it joins "Currently working on" and starts at once (route or spawn). This-sprint tasks are worked in order once the user says go.
- Say "Currently working on", never "Now", when you name that section to the user.
- Sprints are weekly (Linear-style): one sprint goal; inbox → backlog → sprint; unfinished work rolls over. Keep the goal in mind and flag tasks that don't serve it.
- Plan first only when the user asks: then spawn the teammate in plan mode and approve its plan.
- Give each teammate its task file path; it keeps notes there. When it is done, task_update status done with a summary and the commits.
- Tell the user in one line where each message went.
- The user's sprint board is /better-tasks (settings: /better-tasks config); /away turns the screens off.
- To customize better-tasks for this project (numbering, these rules, teammate instructions, the task template), call project_init and edit the files in .claude/manager/.`

const TEAMMATE = `# Working as a better-tasks teammate
- Your task file (its path is in this prompt) is yours: keep short dated notes in its Notes section as you go.
- Stay in your area's files; ask the lead before you touch files another teammate owns.
- Commit small and often. When done, report to the lead: what changed, the commits, and what you could not verify.
- Asked for a handoff (a message starting with HANDOFF:): write where you are, what is left and the traps into the task file, then reply.`

const TASK_TEMPLATE = `## Goal
{goal}

## Notes
`

const TIPS = `/better-tasks  ↑↓ select · ⏎ actions, ←→ choose · m move, ↑↓, ⏎ stop
"create a task …" → asks which sprint · "start T-003" → a teammate takes it
/away  screens off, Mac keeps working`

export const SHIPPED: Record<TextName, string> = {
  coordinator: COORDINATOR,
  teammate: TEAMMATE,
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

/** Every starter file, by its path relative to the project root. */
export function starterFiles(): Record<string, string> {
  const texts = Object.keys(SHIPPED).map(name => [overridePath(name as TextName), starterText(name as TextName)])
  return Object.fromEntries([[CONFIG_FILE, starterConfig()], ...texts])
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
