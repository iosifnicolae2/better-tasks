import type { Task } from '../types'
import { isOpen, labelsOf } from './tasks'

// Full-text search over every task, closed ones too: id, title, labels and body. A title or label match outranks a body match.

export type SearchField = 'id' | 'title' | 'body'

/** A [start, end) character range to highlight. */
export type Range = [number, number]

export type SearchHit = {
  task: Task
  score: number
  /** Where the words were found. */
  fields: SearchField[]
  /** The query's words in task.title. */
  titleMatches: Range[]
  /** "…text around the first body match…" on one line; absent when only the id or title matched. */
  snippet?: string
  /** The query's words in the snippet. */
  snippetMatches?: Range[]
}

const SCORE = { id: 1000, phrase: 300, word: 100, prefix: 50, body: 10, bodyRepeat: 2, open: 5 } as const
const SNIPPET_SIDE = 60
const REPEATS_COUNTED = 5

/** Lower case, accents dropped ("Café" → "cafe"), with each kept character's place in the original. */
function folded(text: string): { text: string; at: number[] } {
  let out = ''
  const at: number[] = []
  for (let index = 0; index < text.length; index++) {
    const plain = (text[index] ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    out += plain
    for (let n = 0; n < plain.length; n++) at.push(index)
  }
  return { text: out, at }
}

export const fold = (text: string) => folded(text).text

const wordsOf = (query: string) => fold(query).split(/[^\p{L}\p{N}-]+/u).filter(Boolean)

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const hasWord = (text: string, word: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word)}($|[^\\p{L}\\p{N}])`, 'u').test(text)

const hasPrefix = (text: string, word: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word)}`, 'u').test(text)

const count = (text: string, word: string) => text.split(word).length - 1

/** Where the words occur in `text`, as merged [start, end) ranges of the original characters. */
export function matchRanges(text: string, words: readonly string[]): Range[] {
  const { text: plain, at } = folded(text)
  const ranges: Range[] = []
  for (const word of words) {
    for (let index = plain.indexOf(word); index >= 0; index = plain.indexOf(word, index + word.length)) {
      ranges.push([at[index] ?? 0, (at[index + word.length - 1] ?? 0) + 1])
    }
  }
  ranges.sort((a, b) => a[0] - b[0])
  return ranges.reduce<Range[]>((merged, range) => {
    const last = merged.at(-1)
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([...range])
    return merged
  }, [])
}

/** "…around the first match…" in the original body text, on one line. */
function snippetOf(body: string, words: readonly string[]): string {
  const { text, at } = folded(body)
  const hits = words.map(word => text.indexOf(word)).filter(index => index >= 0)
  if (hits.length === 0) return ''
  const first = Math.min(...hits)
  const start = at[Math.max(0, first - SNIPPET_SIDE)] ?? 0
  const end = (at[Math.min(text.length - 1, first + SNIPPET_SIDE)] ?? body.length - 1) + 1
  const middle = body.slice(start, end).replace(/^#+ /gm, '').replace(/\s+/g, ' ').trim()
  const before = body.slice(0, start).trim() ? '…' : ''
  const after = body.slice(end).trim() ? '…' : ''
  return `${before}${middle}${after}`
}

/** The body without the template's own headings, so "goal" or "notes" don't match every task. */
const bodyText = (task: Task) => task.body.replace(/^## (Goal|Notes|Plan)\s*$/gm, '')

function scoreOf(task: Task, query: string, words: readonly string[]): SearchHit | undefined {
  const id = fold(task.id)
  const title = fold(task.title)
  const body = fold(bodyText(task))
  const labels = fold(labelsOf(task).join(' '))
  const isId = fold(query.trim()) === id
  const fields = new Set<SearchField>()
  let score = isId ? SCORE.id : 0
  if (isId) fields.add('id')
  if (title.includes(words.join(' '))) score += SCORE.phrase
  for (const word of words) {
    const inId = id.includes(word)
    const inTitle = title.includes(word)
    const inBody = body.includes(word)
    const inLabels = labels.includes(word)
    if (!inId && !inTitle && !inBody && !inLabels && !isId) return undefined
    if (inId) fields.add('id')
    if (inLabels) score += SCORE.word
    if (inTitle) {
      fields.add('title')
      score += hasWord(title, word) ? SCORE.word : hasPrefix(title, word) ? SCORE.prefix : SCORE.body
    }
    if (inBody) {
      fields.add('body')
      score += SCORE.body + SCORE.bodyRepeat * Math.min(REPEATS_COUNTED, count(body, word))
    }
  }
  if (isOpen(task)) score += SCORE.open
  const snippet = snippetOf(bodyText(task), words)
  const titleMatches = matchRanges(task.title, words)
  if (!snippet) return { task, score, fields: [...fields], titleMatches }
  return { task, score, fields: [...fields], titleMatches, snippet, snippetMatches: matchRanges(snippet, words) }
}

const newestFirst = (a: Task, b: Task) =>
  b.created.localeCompare(a.created) || b.id.localeCompare(a.id, undefined, { numeric: true })

/** Every task matching all the query's words, best first: id, then title phrase, title words, title prefixes, then body. */
export function searchTasks(tasks: readonly Task[], query: string, limit = 20): SearchHit[] {
  const words = wordsOf(query)
  if (words.length === 0) return []
  return tasks
    .flatMap(task => scoreOf(task, query, words) ?? [])
    .sort((a, b) => b.score - a.score || newestFirst(a.task, b.task))
    .slice(0, limit)
}
