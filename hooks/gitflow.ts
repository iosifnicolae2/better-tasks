import type { FsEntry } from 'claude-code'

import { hasGitHub, PR_DONE_LINE } from './pullrequest'
import type { PrTemplate } from './prtemplate'

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
  direct: 'small commits land on main in this checkout. No branches, no PRs. Fastest.',
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

/** A one-checkout flow commits only its own paths: bin/land.sh does it from a private index. */
function landLine(bin: string, branch: string): string {
  const onto = branch ? ` -b ${branch}` : ''
  return `- Commit only your own files: \`${bin}/land.sh${onto} -m "<what changed> (T-004)" -- <your paths>\`. It commits them from a private index, so another teammate's staged files never enter your commit, runs the pre-commit hook, and refuses when the branch moved meanwhile: run it again. Small commits, the task id in the subject.
- Never \`git add -A\`, \`git commit -a\`, \`git stash\`, \`git checkout -- <file>\`, \`git reset --hard\` or a branch switch: the other teammates work in the same files.`
}

/** What a PR's description holds, in every PR flow (the user reads it on GitHub, often on a phone): the template it fills in (prtemplate.ts). */
export function prBodyRules(template?: Pick<PrTemplate, 'path' | 'source'>): string {
  const ending = 'Drop its <!-- --> comments; keep its checklists, ticking what is true. Never add a template to the repo yourself: the user does it from the settings page.'
  if (!template || template.source === 'shipped') {
    const path = template ? ` (\`${template.path}\`; this project has none of its own)` : ''
    return `- The PR's description fills in better-tasks' template${path}, in plain words, kept short, in this order: "## Asked for": the user's request, in their words from the task file; "## Why": why it was needed, the problem it solves or the feature it adds; the video (the solution: its two lines) when there is one; "## What changed": what was implemented, a few lines; "## To test": the steps; "## Notes": risk, follow-ups, a linked issue, or "None"; "## Commits": one line each, then the task file's path. ${ending}`
  }
  return `- The PR's description fills in this project's template, \`${template.path}\` (read it first): each of its sections, in plain words, kept short. At the top, the user's request (their words from the task file) and why it was needed (the problem it solves or the feature it adds): in the template's matching sections, else as "## Asked for" and "## Why" above them; the video (the solution: its two lines) right after those, when there is one. Not in the template? Add at the end: "## Commits", one line each, then the task file's path. ${ending}`
}

export function directTeammateRules(bin: string): string {
  return `## Git flow: straight to main (this project)
One checkout, shared with the other teammates: no branch, no worktree, no PR.
${landLine(bin, '')}`
}

export function devTeammateRules(bin: string, dev: string): string {
  return `## Git flow: shared ${dev} branch, a PR per task (this project)
One checkout, on \`${dev}\`, shared with the other teammates: no worktree. Installs and tests build \`${dev}\`, so the user tries every change together.
${landLine(bin, dev)}
- A commit for two tasks names both ids. Never commit to main.
${PR_DONE_LINE}`
}

/**
 * A worktree-isolated teammate's gh/git commands: Claude Code refuses (in Bash and Monitor alike) one it can't
 * prove stays in the worktree. Shapes tested for real in T-040; a script run by its path is never read, so passes.
 */
export const WORKTREE_COMMAND_RULES = `## gh and git in your worktree
Claude Code refuses a Bash or Monitor command running gh or git that it can't check stays in your worktree ("too complex to verify").
- Refused: \`( … )\` subshell, \`{ …; }\` group, a function, \`bash -c\`, heredoc, \`[[ … ]]\`, \`cd\` or \`git -C\` to another checkout.
- Refused too: a gh argument (a title, a search) that starts with "git", or has a quote mark and the word git: reword it; long text goes in a file (\`--body-file\`).
- Fine: plain commands, \`;\`, \`&&\`, pipes, jq \`\\(.x)\`, \`$( … )\`, for/while, if, case, \`[ … ]\`.
- Watch a PR's checks: Bash with run_in_background, one notice when they end: \`gh pr checks <n> --watch --fail-fast >/dev/null; gh pr checks <n>\`. A run: \`gh run watch <id> --exit-status --compact\`.
- Need more logic? Write a script to your scratchpad and run it by its path; it still targets only your worktree.`

export function teammateRules(flow: GitFlow, bin: string, dev: string, prRules: string): string {
  if (flow === 'dev-prs') return devTeammateRules(bin, dev)
  return flow === 'worktree-prs' ? prRules : directTeammateRules(bin)
}

/** What the pull-request skill reads under its title: which flow's part applies, and how to write the description. */
export function prSkillSettings(flow: GitFlow, dev: string, body: string): string {
  if (flow === 'dev-prs') return `- Git flow: shared dev branch \`${dev}\`: follow "Shared dev branch".\n${body}`
  if (flow === 'worktree-prs') return `- Git flow: worktree and PR per task: follow "Worktree and PR per task".\n${body}`
  return '- Git flow: straight to main: this project has no PRs; nothing to do here.'
}

/** The lead's Finishing line for a PR (the PR link in the question), taken from the PR flow's rules so both say the same. */
export const finishingOf = (prLeadRules: string) => prLeadRules.split('\n').filter(line => line.startsWith('- A finished task')).join('\n')

export function devLeadRules(bin: string, dev: string, prLeadRules: string): string {
  return `## Git flow: shared ${dev} branch, a PR per task (on)
- The project's checkout stays on \`${dev}\`; teammates land there. An install or test for the user builds \`${dev}\`.
${finishingOf(prLeadRules)}
- Mark as resolved: \`gh pr merge <url> --squash --delete-branch\`, then \`python3 ${bin}/task_pr.py sync\` (main follows origin's main; \`${dev}\` takes it in without a file changing), then close the task with the merge commit. sync refuses: a fix was made on the task branch, not on \`${dev}\`: the owner lands it on \`${dev}\`, then sync again.
- The merge fails (a conflict): the owner lands what the PR needs on \`${dev}\` and runs open again.`
}

/** "Straight to main" adds nothing for the lead: no PR, no merge. */
export function leadRules(flow: GitFlow, bin: string, dev: string, prRules: string): string {
  if (flow === 'dev-prs') return devLeadRules(bin, dev, prRules)
  return flow === 'worktree-prs' ? prRules : ''
}

