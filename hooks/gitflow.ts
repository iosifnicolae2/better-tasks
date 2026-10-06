import type { FsEntry } from 'claude-code'

import { hasGitHub } from './pullrequest'

// The git flow (setting gitFlow): how a teammate's work reaches main. The first start in a project asks
// which one (recommended from a cheap look at the project, done once) and saves the answer in its
// config.json. The rules of the chosen flow only go into the prompts. The parts that need `$` are in register.tsx.

export const GIT_FLOWS = ['direct', 'dev-prs', 'worktree-prs'] as const
export type GitFlow = (typeof GIT_FLOWS)[number]

export const FLOW_LABELS: Record<GitFlow, string> = {
  direct: 'Straight to main',
  'dev-prs': 'Shared dev branch, PR per task',
  'worktree-prs': 'Worktree and PR per task',
}

const FLOW_ABOUT: Record<GitFlow, string> = {
  direct: 'small commits land on main in this checkout. No branches, no PRs, except a bug fix\'s. Fastest.',
  'dev-prs': 'everyone commits on dev in this checkout, so one build and one install test it all; each task becomes its own PR, with its video.',
  'worktree-prs': 'each teammate gets its own copy and branch and opens its PR; each copy costs an install or a build.',
}

/** The flow a project's values name: gitFlow, else the old "PR per task" switch, else straight to main. */
export function flowOf(values: Record<string, unknown>): GitFlow {
  const named = GIT_FLOWS.find(flow => flow === values.gitFlow)
  if (named) return named
  return values.pullRequests === true ? 'worktree-prs' : 'direct'
}

/** Teammates get a worktree only in the worktree flow, or under "straight to main" with the old worktree switch on. */
export function usesWorktree(flow: GitFlow, worktree: boolean): boolean {
  return flow === 'worktree-prs' || (flow === 'direct' && worktree)
}

export const hasPrs = (flow: GitFlow) => flow !== 'direct'

// ---- Looking at the project, once, for the recommendation ----

/** Folders whose size says how heavy a fresh copy of the project is (each worktree builds or installs anew). */
export const CACHE_DIRS = ['target', 'build', '.build', 'DerivedData', '.gradle', 'node_modules', 'Pods']
/** A cache of this many MB or more makes a worktree per teammate slow. */
export const HEAVY_MB = 2048
/** du gets this long; a cache it can't measure in time counts as heavy. */
export const DU_TIMEOUT_MS = 3000

export type ProjectFacts = {
  hasGitHub: boolean
  /** Build caches, in MB, measured only when they decide the flow (0 otherwise); undefined when du ran out of time (very big). */
  cacheMb: number | undefined
  /** What gets installed and run on a device or as an app ("an Xcode app"); '' for none. */
  app: string
  /** People who committed in the last 90 days (bots left out). */
  authors: number
  /** A GitHub workflow runs on pull requests. */
  prChecks: boolean
}

/** What looking needs, so it runs against the engine or a test alike. */
export type Probe = {
  root: string
  /** stdout, or undefined when the command failed or ran out of time. */
  run: (argv: string[], timeoutMs?: number) => Promise<string | undefined>
  list: (path: string) => Promise<FsEntry[]>
  read: (path: string) => Promise<string | undefined>
}

const SKIP_DIRS = new Set(['.git', '.claude', '.idea', '.vscode', 'docs', 'test', 'tests', ...CACHE_DIRS])
/** Folders looked into below the root: two levels, at most this many. */
const MAX_LISTED = 120

type Folder = { path: string; entries: FsEntry[] }

/** The root and the folders two levels below it, skipping caches and hidden folders. */
async function foldersOf(probe: Probe): Promise<Folder[]> {
  const listed = async (path: string): Promise<Folder> => ({ path, entries: await probe.list(path).catch(() => []) })
  const inside = (folder: Folder) =>
    folder.entries.filter(entry => entry.kind === 'dir' && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')).map(entry => `${folder.path}/${entry.name}`)
  const root = await listed(probe.root)
  const first = await Promise.all(inside(root).slice(0, MAX_LISTED).map(listed))
  const second = await Promise.all(first.flatMap(inside).slice(0, MAX_LISTED - first.length).map(listed))
  return [root, ...first, ...second]
}

/**
 * One cheap look: directory listings two levels down, `git remote`, `git shortlog`, the workflow files,
 * and only when it decides the flow (a team or CI on PRs, no app) one `du` of the caches, 3 s at most.
 */
export async function lookAt(probe: Probe): Promise<ProjectFacts> {
  const folders = await foldersOf(probe)
  const [remotes, shortlog, prChecks] = await Promise.all([
    probe.run(['git', 'remote', '-v']),
    probe.run(['git', 'shortlog', '-sne', '--since=90.days', 'HEAD']),
    hasPrChecks(probe),
  ])
  const facts = {
    hasGitHub: hasGitHub(remotes ?? ''),
    cacheMb: 0,
    app: appOf(folders.flatMap(folder => folder.entries.map(entry => entry.name))),
    authors: authorsOf(shortlog ?? ''),
    prChecks,
  }
  const needsSize = facts.hasGitHub && !facts.app && (facts.authors >= 2 || facts.prChecks)
  return needsSize ? { ...facts, cacheMb: await cacheSize(probe, folders) } : facts
}

/** The build caches' size in MB; undefined when du ran out of time (very big). */
async function cacheSize(probe: Probe, folders: readonly Folder[]): Promise<number | undefined> {
  const caches = folders.flatMap(folder => folder.entries.filter(entry => entry.kind !== 'file' && CACHE_DIRS.includes(entry.name)).map(entry => `${folder.path}/${entry.name}`))
  if (caches.length === 0) return 0
  const du = await probe.run(['du', '-sk', ...caches], DU_TIMEOUT_MS)
  return du === undefined ? undefined : megabytesOf(du)
}

async function hasPrChecks(probe: Probe): Promise<boolean> {
  const folder = `${probe.root}/.github/workflows`
  const files = (await probe.list(folder).catch(() => [])).filter(entry => /\.ya?ml$/.test(entry.name)).slice(0, 20)
  const texts = await Promise.all(files.map(file => probe.read(`${folder}/${file.name}`)))
  return texts.some(text => text !== undefined && /\bpull_request(_target)?\b/.test(text))
}

/** The sum of `du -sk` lines, in MB. */
export function megabytesOf(du: string): number {
  const kb = du.split('\n').reduce((sum, line) => sum + (Number.parseInt(line, 10) || 0), 0)
  return Math.round(kb / 1024)
}

/** People in `git shortlog -sne`: a name or an email seen before is the same person; bots left out. */
export function authorsOf(shortlog: string): number {
  const seen = new Set<string>()
  let people = 0
  for (const line of shortlog.split('\n')) {
    const match = line.match(/^\s*\d+\s+(.*?)\s*<([^>]*)>\s*$/)
    if (!match || /\[bot\]|bot$/i.test(match[1]!)) continue
    const keys = [match[1]!.toLowerCase(), match[2]!.toLowerCase()]
    if (!keys.some(key => seen.has(key))) people += 1
    for (const key of keys) seen.add(key)
  }
  return people
}

/** What gets built and run as an app, from the names at the top and one level down. */
export function appOf(names: readonly string[]): string {
  if (names.some(name => name.endsWith('.xcodeproj') || name.endsWith('.xcworkspace'))) return 'an Xcode app'
  if (names.includes('pubspec.yaml')) return 'a Flutter app'
  if (names.includes('src-tauri') || names.includes('tauri.conf.json') || names.includes('Tauri.toml')) return 'a Tauri app'
  if (names.includes('AndroidManifest.xml') || names.includes('android')) return 'an Android app'
  return ''
}

const gigabytes = (mb: number) => `${Math.round(mb / 102.4) / 10} GB`

/**
 * The flow that fits, and why, in a few plain words. An app to install: everyone on one dev branch, so one
 * build and one install test it all. A team or CI on PRs: a PR per task, from dev when a copy is heavy to
 * build. Else straight to main: nobody reviews a PR.
 */
export function recommend(facts: ProjectFacts): { flow: GitFlow; reason: string } {
  if (!facts.hasGitHub) return { flow: 'direct', reason: 'no GitHub remote, so no PRs' }
  if (facts.app) return { flow: 'dev-prs', reason: `${facts.app} to build and install once for every change` }
  if (facts.authors < 2 && !facts.prChecks) return { flow: 'direct', reason: 'one person, no app to install and no CI on PRs' }
  const why = [facts.authors >= 2 && `${facts.authors} people commit`, facts.prChecks && 'CI runs on PRs'].filter(Boolean).join(', ')
  if (facts.cacheMb === undefined || facts.cacheMb >= HEAVY_MB) {
    const cache = facts.cacheMb === undefined ? 'a build cache too big to measure quickly' : `a ${gigabytes(facts.cacheMb)} build cache`
    return { flow: 'dev-prs', reason: `${why}, and ${cache} for every copy` }
  }
  return { flow: 'worktree-prs', reason: `${why}, and a copy is cheap to set up` }
}

// ---- The first-start question ----

export const FLOW_ASK_HEADER = 'Git flow'
export const RECOMMENDED = ' (Recommended)'

/** The options, the recommended one first and marked. */
export function flowOptions(recommended: GitFlow): string[] {
  const order = [recommended, ...GIT_FLOWS.filter(flow => flow !== recommended)]
  return order.map(flow => FLOW_LABELS[flow] + (flow === recommended ? RECOMMENDED : ''))
}

export function flowQuestion(recommended: { flow: GitFlow; reason: string }): string {
  return [
    "How should teammates' work reach main in this project?",
    ...GIT_FLOWS.map(flow => `${FLOW_LABELS[flow]}: ${FLOW_ABOUT[flow]}`),
    `Recommended here: ${FLOW_LABELS[recommended.flow]} (${recommended.reason}). Change it later in /better-tasks config.`,
  ].join('\n')
}

/** The flow an answer picked; undefined for free text that names none. */
export function flowOfAnswer(answer: string): GitFlow | undefined {
  const label = answer.replace(RECOMMENDED, '').trim().toLowerCase()
  return GIT_FLOWS.find(flow => FLOW_LABELS[flow].toLowerCase() === label || flow === label)
}

// ---- The rules each flow adds to the prompts ----
