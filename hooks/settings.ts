import type { PluginOptions } from 'claude-code'

import type { Files } from './io'
import type { SprintConfig } from './sprints'

// Every setting, resolved in one place: shipped defaults < the plugin's options (/config) < the project's config.json.

export type Editor = 'auto' | 'default' | 'code' | 'idea' | 'cursor' | 'zed'

export type TaskNaming = {
  /** "T-" in "T-001". */
  prefix: string
  /** Digits, zero-padded: 3 → "001". */
  padding: number
  /** The first task's number. */
  start: number
  /** File name of a task: {id}, {slug} and {title} are filled in. */
  fileName: string
  /** Folder of the task files, relative to the project root. */
  folder: string
}

export type Paths = {
  /** The finished-task log, relative to the project root. */
  log: string
  /** Sprint goals and reviews, relative to the project root. */
  sprints: string
}

export type Settings = {
  editor: Editor
  worktree: boolean
  contextLimit: number
  /** The 1-hour prompt cache for teammates and the manager. */
  longCache: boolean
  keepAwake: boolean
  sprint: SprintConfig
  tasks: TaskNaming
  paths: Paths
}

const EDITORS = ['auto', 'default', 'code', 'idea', 'cursor', 'zed']
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

type Field = { kind: 'string' | 'number' | 'boolean'; values?: readonly string[] }

/** Every key a project's config.json may set. */
export const FIELDS: Record<string, Field> = {
  editor: { kind: 'string', values: EDITORS },
  worktree: { kind: 'boolean' },
  contextLimit: { kind: 'number' },
  longCache: { kind: 'boolean' },
  keepAwake: { kind: 'boolean' },
  sprintWeeks: { kind: 'string', values: ['1', '2', '3', '4'] },
  sprintStart: { kind: 'string', values: WEEKDAYS },
  taskPrefix: { kind: 'string' },
  taskPadding: { kind: 'number' },
  taskStart: { kind: 'number' },
  taskFileName: { kind: 'string' },
  tasksFolder: { kind: 'string' },
  logFile: { kind: 'string' },
  sprintsFile: { kind: 'string' },
}

export const DEFAULTS: Readonly<Record<string, string | number | boolean>> = {
  editor: 'auto',
  worktree: false,
  contextLimit: 50,
  longCache: true,
  keepAwake: true,
  sprintWeeks: '1',
  sprintStart: 'monday',
  taskPrefix: 'T-',
  taskPadding: 3,
  taskStart: 1,
  taskFileName: '{id}-{slug}.md',
  tasksFolder: '.claude/tasks',
  logFile: 'docs/tasks.md',
  sprintsFile: '.claude/tasks/sprints.md',
}

export function settingsOf(options: PluginOptions | Record<string, unknown>): Settings {
  const value = (key: string) => options[key] ?? DEFAULTS[key]
  return {
    editor: value('editor') as Editor,
    worktree: value('worktree') === true,
    contextLimit: Number(value('contextLimit')),
    longCache: value('longCache') !== false,
    keepAwake: value('keepAwake') !== false,
    sprint: {
      weeks: Math.min(4, Math.max(1, Number(value('sprintWeeks')) || 1)),
      startDay: Math.max(0, WEEKDAYS.indexOf(String(value('sprintStart')))),
    },
    tasks: {
      prefix: String(value('taskPrefix')),
      padding: Number(value('taskPadding')),
      start: Number(value('taskStart')),
      fileName: String(value('taskFileName')),
      folder: String(value('tasksFolder')),
    },
    paths: { log: String(value('logFile')), sprints: String(value('sprintsFile')) },
  }
}

// ---- The project's config.json ----

export const CONFIG_FILE = '.claude/tasks/config.json'

/** The keys a project sets, and what was wrong with the rest (each skipped). */
export type Overrides = { values: Record<string, unknown>; problems: string[] }

function problemOf(key: string, value: unknown): string | undefined {
  const field = FIELDS[key]
  if (!field) return `unknown key "${key}"`
  if (field.values) return field.values.includes(String(value)) ? undefined : `"${key}" must be one of ${field.values.join(', ')}`
  return typeof value === field.kind ? undefined : `"${key}" must be a ${field.kind}`
}

/** Reads config.json's text; keys starting with "//" are comments. */
export function parseOverrides(text: string): Overrides {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    return { values: {}, problems: [`${CONFIG_FILE} is not valid JSON (${(error as Error).message})`] }
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { values: {}, problems: [`${CONFIG_FILE} must hold one JSON object`] }
  }
  const values: Record<string, unknown> = {}
  const problems: string[] = []
  for (const [key, value] of Object.entries(json)) {
    if (key.startsWith('//')) continue
    const problem = problemOf(key, value)
    if (problem) problems.push(problem)
    else values[key] = value
  }
  return { values, problems }
}

export async function readOverrides(files: Files): Promise<Overrides> {
  const text = await files.read(`${await files.root()}/${CONFIG_FILE}`).catch(() => undefined)
  return text === undefined ? { values: {}, problems: [] } : parseOverrides(text)
}

/** The settings of this project: the plugin's options with the project's config.json over them. */
export async function projectSettings(files: Files, options: PluginOptions): Promise<Settings> {
  return settingsOf({ ...options, ...(await readOverrides(files)).values })
}

/** What the parts read: the project's settings when `files` knows them, else the shipped defaults. */
export async function settingsFrom(files: Files): Promise<Settings> {
  return files.config ? files.config() : settingsOf({})
}
