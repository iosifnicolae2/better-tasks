import type { FsEntry } from 'claude-code'

// The project's own instructions for tasks (setting `instructions`): paths to files or folders that the
// lead and every teammate should follow. The prompts carry each path and one line about it, never the
// file: whoever needs it reads it. About 50 tokens a path.

/** One line about a file, cut to this many characters. */
export const SUMMARY_CHARS = 200
/** A folder lists at most this many of its .md files. */
export const FOLDER_FILES = 10

export type Reader = {
  root: string
  read: (path: string) => Promise<string | undefined>
  list: (path: string) => Promise<FsEntry[] | undefined>
}

/** "docs/a.md, docs/rules/" → ["docs/a.md", "docs/rules"]. */
export function pathsOf(setting: string): string[] {
  return setting
    .split(',')
    .map(path => path.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

const COMMENT = /<!--[\s\S]*?-->/g
const FRONT_MATTER = /^---\n[\s\S]*?\n---\n/

/** The title (its first heading) and the first line of text after it: "Title: first line", cut short. */
export function summaryOf(text: string): string {
  const lines = text.replace(FRONT_MATTER, '').replace(COMMENT, '').split('\n').map(line => line.trim()).filter(Boolean)
  const titleAt = lines.findIndex(line => line.startsWith('#'))
  const title = titleAt === -1 ? '' : lines[titleAt]!.replace(/^#+\s*/, '')
  const first = lines.slice(titleAt + 1).find(line => !line.startsWith('#') && !line.startsWith('```') && !line.startsWith('|')) ?? ''
  const summary = [title, first.replace(/\*\*/g, '')].filter(Boolean).join(': ')
  return summary.length > SUMMARY_CHARS ? `${summary.slice(0, SUMMARY_CHARS - 1).trimEnd()}…` : summary
}

/** One bullet per path; a folder's own .md files each get a line. The missing paths are listed apart. */
export async function instructionLines(reader: Reader, setting: string): Promise<{ lines: string[]; missing: string[] }> {
  const lines: string[] = []
  const missing: string[] = []
  for (const path of pathsOf(setting)) {
    const full = `${reader.root}/${path}`
    const text = await reader.read(full)
    if (text !== undefined) {
      lines.push(withSummary(path, summaryOf(text)))
      continue
    }
    const entries = await reader.list(full)
    if (entries === undefined) {
      missing.push(path)
      continue
    }
    const docs = entries.filter(entry => entry.kind === 'file' && /\.md$/i.test(entry.name)).map(entry => entry.name).sort()
    lines.push(`- ${path}/: ${docs.length} file${docs.length === 1 ? '' : 's'}`)
    for (const name of docs.slice(0, FOLDER_FILES)) {
      lines.push(`  ${withSummary(`${path}/${name}`, summaryOf((await reader.read(`${full}/${name}`)) ?? ''))}`)
    }
  }
  return { lines, missing }
}

const withSummary = (path: string, summary: string) => (summary ? `- ${path}: ${summary}` : `- ${path}`)

/** The block for a prompt; '' when the project names none (or none exists). */
export function instructionsBlock(lines: readonly string[]): string {
  if (lines.length === 0) return ''
  return ['## Project instructions', 'This project has its own instructions for tasks. Read the ones that touch your work before you start, and follow them (they win over the general rules above):', ...lines].join('\n')
}
