// The instruction templates (.claude/better-tasks/*.md): a small Jinja subset, no dependency.
//   {{ name }}                                   a value
//   {% if cond %} … {% elif cond %} … {% else %} … {% endif %}
//   cond: name | not cond | name == "text" | name != "text" | cond and cond | cond or cond
// A line holding only a tag leaves nothing behind. An unknown name is an error, so a template can't drift
// from the settings unnoticed. HTML comments are notes for people: they never reach the model.

export type Vars = Record<string, string | number | boolean>

const TAG = /\{%\s*(.*?)\s*%\}|\{\{\s*(.*?)\s*\}\}/g
const ALONE = /^[ \t]*(\{%[^%]*%\})[ \t]*\n/gm
const COMMENT = /<!--[\s\S]*?-->\n?/g

type Frame = { isTaken: boolean; isOn: boolean; wasOn: boolean }

/** The template filled in with vars; throws on an unknown name or an if left open. */
export function render(template: string, vars: Vars): string {
  const text = template.replace(COMMENT, '').replace(ALONE, '$1')
  const stack: Frame[] = []
  const isShown = () => stack.every(frame => frame.isOn)
  let out = ''
  let at = 0
  for (const match of text.matchAll(TAG)) {
    if (isShown()) out += text.slice(at, match.index)
    at = match.index + match[0].length
    const [, block, value] = match
    if (value !== undefined) {
      if (isShown()) out += String(valueOf(value, vars))
      continue
    }
    const [word = '', ...rest] = block!.split(/\s+/)
    const cond = rest.join(' ')
    const top = stack.at(-1)
    if (word === 'if') {
      const isOn = isShown() && truth(cond, vars)
      stack.push({ isTaken: isOn, isOn, wasOn: isShown() })
    } else if (word === 'elif' && top) {
      top.isOn = !top.isTaken && top.wasOn && truth(cond, vars)
      top.isTaken ||= top.isOn
    } else if (word === 'else' && top) {
      top.isOn = !top.isTaken && top.wasOn
      top.isTaken = true
    } else if (word === 'endif' && top) {
      stack.pop()
    } else {
      throw new Error(`template: unknown tag {% ${block} %}`)
    }
  }
  if (stack.length > 0) throw new Error('template: an {% if %} has no {% endif %}')
  out += text.slice(at)
  return out.replace(/\n{3,}/g, '\n\n').trim()
}

function valueOf(name: string, vars: Vars): string | number | boolean {
  if (!(name in vars)) throw new Error(`template: unknown name "${name}"`)
  return vars[name]!
}

/** A condition: or binds loosest, then and, then not; a comparison is name ==/!= "text". */
function truth(cond: string, vars: Vars): boolean {
  const ors = cond.split(/\s+or\s+/)
  if (ors.length > 1) return ors.some(part => truth(part, vars))
  const ands = cond.split(/\s+and\s+/)
  if (ands.length > 1) return ands.every(part => truth(part, vars))
  const trimmed = cond.trim()
  if (trimmed.startsWith('not ')) return !truth(trimmed.slice(4), vars)
  const compared = trimmed.match(/^(\w+)\s*(==|!=)\s*"([^"]*)"$/)
  if (compared) {
    const [, name, op, text] = compared
    return (String(valueOf(name!, vars)) === text) === (op === '==')
  }
  if (!/^\w+$/.test(trimmed)) throw new Error(`template: can't read the condition "${cond}"`)
  return Boolean(valueOf(trimmed, vars))
}

// ---- Overrides: the project's file of the same name ----

const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n?/
const INCLUDE = /^@(\/|\.\/)(\S+)[ \t]*$/gm

export type Sources = {
  /** The plugin's file by name ("lead.md"); undefined when it has none. */
  plugin: (name: string) => Promise<string | undefined>
  /** A file of the project, by its path from the project root; undefined when missing. */
  project: (path: string) => Promise<string | undefined>
}

export const OVERRIDE_DIR = '.claude/better-tasks'

/**
 * The template in force for one instruction file: the plugin's, extended by the project's file of the same
 * name (its text after the plugin's), or replaced by it (`replace: true` in its front matter). In the
 * project's file, `@/name.md` alone on a line pulls in the plugin's file, `@./path` a project file.
 */
export async function templateOf(name: string, sources: Sources, legacy?: string): Promise<string> {
  const shipped = (await sources.plugin(name)) ?? ''
  const own = (await sources.project(`${OVERRIDE_DIR}/${name}`)) ?? legacy
  if (own === undefined || own === shipped) return shipped
  const front = own.match(FRONT_MATTER)?.[1] ?? ''
  const body = await withIncludes(own.replace(FRONT_MATTER, ''), sources)
  return /^replace:\s*true\s*$/m.test(front) ? body : `${shipped.trimEnd()}\n\n${body}`
}

async function withIncludes(text: string, sources: Sources): Promise<string> {
  const found = [...text.matchAll(INCLUDE)]
  const texts = await Promise.all(found.map(([, from, path]) => (from === '/' ? sources.plugin(path!) : sources.project(path!))))
  return found.reduce((done, [line], index) => done.replace(line, (texts[index] ?? `(missing: ${line})`).trimEnd()), text)
}

// ---- Sections, for a change mid-session ----

/** The text cut at its "## " headings: the heading line (or '' for the text above the first) to its section. */
export function sectionsOf(text: string): Map<string, string> {
  const sections = new Map<string, string>()
  let heading = ''
  let lines: string[] = []
  const keep = () => lines.join('\n').trim() && sections.set(heading, lines.join('\n').trim())
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) {
      keep()
      heading = line
      lines = []
    }
    lines.push(line)
  }
  keep()
  return sections
}

/** The sections of `now` that differ from `before`, and the headings `before` had that `now` dropped. */
export function changedSections(before: string, now: string): { changed: string[]; dropped: string[] } {
  const old = sectionsOf(before)
  const fresh = sectionsOf(now)
  const changed = [...fresh].filter(([heading, text]) => old.get(heading) !== text).map(([, text]) => text)
  const dropped = [...old.keys()].filter(heading => heading && !fresh.has(heading))
  return { changed, dropped }
}
