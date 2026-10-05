import type { PluginOptions } from 'claude-code'

import { flowOf, GIT_FLOWS } from './gitflow'
import type { GitFlow } from './gitflow'
import type { Files } from './io'
import type { SprintConfig } from './sprints'

// Every setting, resolved in one place: shipped defaults < the plugin's options (/config) < the project's config.json.

export type Editor = 'auto' | 'default' | 'code' | 'idea' | 'cursor' | 'zed'

/** How the before/after videos are encoded: low = 720p small file, medium = 1080p, high = 1080p sharper. */
export const VIDEO_QUALITIES = ['low', 'medium', 'high'] as const
export type VideoQuality = (typeof VIDEO_QUALITIES)[number]

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

/** What a teammate runs on: a model alias (the Agent tool's), and how hard it thinks. */
export type ModelChoice = { model: string; effort: string }

/** How hard a task is; each level has its own model and effort. */
export const LEVELS = ['easy', 'normal', 'hard'] as const
export type Level = (typeof LEVELS)[number]

export type TeammateModels = Record<Level, ModelChoice> & {
  /** A teammate that is not reaching the goal gets a successor one level up. */
  escalate: boolean
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
  /** The 1-hour prompt cache for teammates and the manager. */
  longCache: boolean
  /** Minutes of quiet before a status check; 0 = off. */
  statusEvery: number
  keepAwake: boolean
  /** Teammates make a narrated before/after video of finished work. */
  demoVideos: boolean
  videoQuality: VideoQuality
  /** How a teammate's work reaches main (gitflow.ts); the old pullRequests switch reads as worktree-prs. */
  gitFlow: GitFlow
  /** The shared branch of the dev-prs flow. */
  devBranch: string
  /** The project's own instructions for tasks: paths to files or folders, comma-separated (instructions.ts). */
  instructions: string
  /** The user said yes to "may IntelliJ skip the worktrees folder?", asked once per project (intellij.ts). */
  excludeWorktreesFromIde: boolean
  models: TeammateModels
  sprint: SprintConfig
  tasks: TaskNaming
  paths: Paths
}

const EDITORS = ['auto', 'default', 'code', 'idea', 'cursor', 'zed']
/** "inherit": the model of the session that spawns the teammate (the lead). */
export const MODELS = ['sonnet', 'opus', 'fable', 'haiku', 'inherit']
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

type Field = { kind: 'string' | 'number' | 'boolean'; values?: readonly string[] }

/** Every key a project's config.json may set. */
export const FIELDS: Record<string, Field> = {
  editor: { kind: 'string', values: EDITORS },
  worktree: { kind: 'boolean' },
  longCache: { kind: 'boolean' },
  statusEvery: { kind: 'number' },
  keepAwake: { kind: 'boolean' },
  demoVideos: { kind: 'boolean' },
  videoQuality: { kind: 'string', values: VIDEO_QUALITIES },
  pullRequests: { kind: 'boolean' },
  gitFlow: { kind: 'string', values: GIT_FLOWS },
  devBranch: { kind: 'string' },
  instructions: { kind: 'string' },
  excludeWorktreesFromIde: { kind: 'boolean' },
  easyModel: { kind: 'string', values: MODELS },
  easyEffort: { kind: 'string', values: EFFORTS },
  normalModel: { kind: 'string', values: MODELS },
  normalEffort: { kind: 'string', values: EFFORTS },
  hardModel: { kind: 'string', values: MODELS },
  hardEffort: { kind: 'string', values: EFFORTS },
  escalate: { kind: 'boolean' },
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
  longCache: true,
  statusEvery: 10,
  keepAwake: true,
  demoVideos: false,
  videoQuality: 'medium',
  pullRequests: false,
  gitFlow: 'direct',
  devBranch: 'dev',
  instructions: '',
  excludeWorktreesFromIde: false,
  easyModel: 'opus',
  easyEffort: 'low',
  normalModel: 'opus',
  normalEffort: 'medium',
  hardModel: 'opus',
  hardEffort: 'high',
  escalate: true,
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
  const oneOf = (key: string, list: readonly string[]) => (list.includes(String(value(key))) ? String(value(key)) : String(DEFAULTS[key]))
  const choiceOf = (level: Level): ModelChoice => ({ model: oneOf(`${level}Model`, MODELS), effort: oneOf(`${level}Effort`, EFFORTS) })
  return {
    editor: value('editor') as Editor,
    worktree: value('worktree') === true,
    longCache: value('longCache') !== false,
    statusEvery: Math.max(0, Number(value('statusEvery')) || 0),
    keepAwake: value('keepAwake') !== false,
    demoVideos: value('demoVideos') === true,
    videoQuality: oneOf('videoQuality', VIDEO_QUALITIES) as VideoQuality,
    gitFlow: flowOf(options),
    devBranch: String(value('devBranch')).trim() || 'dev',
    instructions: String(value('instructions')),
    excludeWorktreesFromIde: value('excludeWorktreesFromIde') === true,
    models: {
      easy: choiceOf('easy'),
      normal: choiceOf('normal'),
      hard: choiceOf('hard'),
      escalate: value('escalate') !== false,
    },
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

/** Settings that belong to the project only: the settings page writes them to its config.json, never to /config. */
export const PROJECT_KEYS = ['gitFlow', 'devBranch', 'instructions']

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

export async function readOverrides(files: Pick<Files, 'root' | 'read'>): Promise<Overrides> {
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

/** Sets one key in the project's config.json, keeping every other key (comments too); refuses a file that isn't JSON. */
export async function saveProjectValue(files: Pick<Files, 'root' | 'read' | 'write'>, key: string, value: unknown): Promise<string | undefined> {
  const path = `${await files.root()}/${CONFIG_FILE}`
  const text = await files.read(path).catch(() => undefined)
  let json: Record<string, unknown> = {}
  if (text !== undefined) {
    try {
      json = JSON.parse(text) as Record<string, unknown>
    } catch (error) {
      return `${CONFIG_FILE} is not valid JSON (${(error as Error).message}); set "${key}" there by hand`
    }
  }
  const { [`// ${key}`]: _example, ...rest } = json
  await files.write(path, `${JSON.stringify({ ...rest, [key]: value }, null, 2)}\n`)
  return undefined
}
