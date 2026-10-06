import type { FsEntry } from 'claude-code'

// One-time move of a project's files from the old folder (.claude/manager/, tasks in its tasks/)
// to .claude/tasks/ (tasks, sprints.md, config.json and the overrides side by side).

export const OLD_DIR = '.claude/manager'
export const NEW_DIR = '.claude/tasks'

export type Mover = {
  root: () => Promise<string>
  list: (path: string) => Promise<FsEntry[]>
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
  run: (argv: string[]) => Promise<{ exitCode: number }>
}

/** Old paths in a config.json, pointed at the new folder. */
export function movedConfig(text: string): string {
  return text.replaceAll(`${OLD_DIR}/tasks`, NEW_DIR).replaceAll(OLD_DIR, NEW_DIR)
}

/** Moves the old folder when the project has it and not the new one; returns the line to log, if it moved. */
export async function migrateFolder(io: Mover): Promise<string | undefined> {
  const root = await io.root()
  const isDir = (path: string) => io.list(path).then(() => true, () => false)
  const [from, to] = [`${root}/${OLD_DIR}`, `${root}/${NEW_DIR}`]
  if (!(await isDir(from)) || (await isDir(to))) return undefined

  if ((await io.run(['mv', from, to])).exitCode !== 0) return `better-tasks: could not move ${OLD_DIR}/ to ${NEW_DIR}/`
  if (await isDir(`${to}/tasks`)) {
    for (const entry of await io.list(`${to}/tasks`)) await io.run(['mv', '-n', `${to}/tasks/${entry.name}`, `${to}/${entry.name}`])
    await io.run(['rmdir', `${to}/tasks`])
  }
  const config = await io.read(`${to}/config.json`).catch(() => undefined)
  if (config !== undefined && movedConfig(config) !== config) await io.write(`${to}/config.json`, movedConfig(config))
  return `better-tasks: moved ${OLD_DIR}/ to ${NEW_DIR}/ (tasks, sprints, settings)`
}

// One-time move of the old instruction overrides to .claude/better-tasks/ (template.ts): coordinator.md becomes
// lead.md, teammate.md stays teammate.md; the "instructions" setting (paths) becomes a "Project rules" section.

const EXTEND_MARK = '<!-- extend -->'
const RULE_MOVES = [['coordinator.md', 'lead.md'], ['teammate.md', 'teammate.md']] as const

/** An old override as a new one: the extend marker is the new default; a plain one replaced, so it says so. */
export function movedRule(old: string): string {
  const text = old.trimStart()
  return text.startsWith(EXTEND_MARK) ? text.slice(EXTEND_MARK.length).trimStart() : `---\nreplace: true\n---\n${text}`
}

/** The "instructions" setting's paths, as a section both the lead's and the teammates' rules end with. */
export function projectRulesSection(paths: string): string {
  return `\n## Project rules\nRead before you work: ${paths.split(',').map(path => path.trim()).filter(Boolean).join(', ')}.\n`
}

/** Moves the old overrides and the "instructions" setting into .claude/better-tasks/; returns the line to log, if anything moved. */
export async function migrateRules(io: Mover): Promise<string | undefined> {
  const root = await io.root()
  const read = (path: string) => io.read(`${root}/${path}`).catch(() => undefined)
  const moved: string[] = []
  for (const [from, to] of RULE_MOVES) {
    const old = await read(`${NEW_DIR}/${from}`)
    if (old === undefined) continue
    if ((await read(`${RULES_DIR}/${to}`)) === undefined) await io.write(`${root}/${RULES_DIR}/${to}`, movedRule(old))
    await io.run(['rm', `${root}/${NEW_DIR}/${from}`])
    moved.push(`${from} → ${RULES_DIR}/${to}`)
  }
  const configText = await read(`${NEW_DIR}/config.json`)
  const config = parsed(configText)
  const paths = typeof config?.instructions === 'string' ? config.instructions.trim() : ''
  if (config && 'instructions' in config) {
    for (const to of ['lead.md', 'teammate.md']) {
      if (!paths) break
      const own = (await read(`${RULES_DIR}/${to}`)) ?? ''
      await io.write(`${root}/${RULES_DIR}/${to}`, `${own.trimEnd()}\n${projectRulesSection(paths)}`.trimStart())
    }
    const { instructions: _dropped, ...rest } = config
    await io.write(`${root}/${NEW_DIR}/config.json`, `${JSON.stringify(rest, null, 2)}\n`)
    if (paths) moved.push(`the "instructions" setting → a "Project rules" section in ${RULES_DIR}/lead.md and teammate.md`)
  }
  return moved.length > 0 ? `better-tasks: moved ${moved.join('; ')}` : undefined
}

const RULES_DIR = '.claude/better-tasks'

function parsed(text: string | undefined): Record<string, unknown> | undefined {
  if (text === undefined) return undefined
  try {
    const json = JSON.parse(text) as unknown
    return json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}
