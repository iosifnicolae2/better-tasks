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
  /** Build caches, in MB; undefined when du ran out of time (very big). */
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

const SKIP_DIRS = new Set(['.git', '.claude', '.idea', '.vscode', ...CACHE_DIRS])

/** One cheap look: a few directory listings, `git remote`, `git shortlog`, one bounded `du`. */
export async function lookAt(probe: Probe): Promise<ProjectFacts> {
  const top = await probe.list(probe.root).catch(() => [])
  const subdirs = top.filter(entry => entry.kind === 'dir' && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')).slice(0, 40)
  const below = await Promise.all(subdirs.map(dir => probe.list(`${probe.root}/${dir.name}`).then(entries => ({ dir: dir.name, entries }), () => ({ dir: dir.name, entries: [] }))))
  const levels = [{ dir: '', entries: top }, ...below]
  const caches = levels.flatMap(({ dir, entries }) =>
    entries.filter(entry => entry.kind !== 'file' && CACHE_DIRS.includes(entry.name)).map(entry => [probe.root, dir, entry.name].filter(Boolean).join('/')),
  )
  const [remotes, shortlog, du, prChecks] = await Promise.all([
    probe.run(['git', 'remote', '-v']),
    probe.run(['git', 'shortlog', '-sne', '--since=90.days', 'HEAD']),
    caches.length === 0 ? Promise.resolve('') : probe.run(['du', '-sk', ...caches], DU_TIMEOUT_MS),
    hasPrChecks(probe),
  ])
  return {
    hasGitHub: hasGitHub(remotes ?? ''),
    cacheMb: du === undefined ? undefined : megabytesOf(du),
    app: appOf(levels.flatMap(level => level.entries.map(entry => entry.name))),
    authors: authorsOf(shortlog ?? ''),
    prChecks,
  }
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

/** People in `git shortlog -sne`: one per name (a person with two emails counts once), bots left out. */
export function authorsOf(shortlog: string): number {
  const names = shortlog
    .split('\n')
    .map(line => line.replace(/^\s*\d+\s+/, '').replace(/\s*<[^>]*>\s*$/, '').trim())
    .filter(name => name && !/\[bot\]|\bbot$/i.test(name))
  return new Set(names.map(name => name.toLowerCase())).size
}

/** What gets built and run as an app, from the names at the top and one level down. */
export function appOf(names: readonly string[]): string {
  if (names.some(name => name.endsWith('.xcodeproj') || name.endsWith('.xcworkspace'))) return 'an Xcode app'
  if (names.includes('pubspec.yaml')) return 'a Flutter app'
  if (names.includes('src-tauri') || names.includes('tauri.conf.json')) return 'a Tauri app'
  if (names.includes('AndroidManifest.xml') || names.includes('android')) return 'an Android app'
  return ''
}

const gigabytes = (mb: number) => `${Math.round(mb / 102.4) / 10} GB`

/** The flow that fits, and why, in a few plain words. */
export function recommend(facts: ProjectFacts): { flow: GitFlow; reason: string } {
  if (!facts.hasGitHub) return { flow: 'direct', reason: 'no GitHub remote, so no PRs' }
  const isHeavy = facts.cacheMb === undefined || facts.cacheMb >= HEAVY_MB
  if (isHeavy || facts.app) {
    const cache = facts.cacheMb === undefined ? 'a build cache too big to measure quickly' : isHeavy ? `a ${gigabytes(facts.cacheMb)} build cache` : ''
    return { flow: 'dev-prs', reason: [cache, facts.app && `${facts.app} to install`].filter(Boolean).join(' and ') }
  }
  if (facts.authors >= 2 || facts.prChecks) {
    const why = [facts.authors >= 2 && `${facts.authors} people commit`, facts.prChecks && 'CI runs on PRs'].filter(Boolean).join(', ')
    return { flow: 'worktree-prs', reason: `${why}, and a copy is cheap to set up` }
  }
  return { flow: 'direct', reason: 'one person, a light build and no CI on PRs' }
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

/** What a PR's description holds, in every PR flow (the user reads it on GitHub, often on a phone). */
export const PR_BODY_RULES = `- The PR's description, in plain words, in this order: the video (two lines, below) when there is one; "Asked for": the user's request, in their words from the task file; "Why": the problem it solves; "What changed": what was implemented, a few lines; "To test": the steps; the task file's path.`

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
${PR_BODY_RULES}
- Done: write that description to <scratchpad>/pr.md, then \`python3 ${bin}/task_pr.py open T-004 --body-file <scratchpad>/pr.md\`. It puts the task's commits on \`task/T-004\` (origin's main plus them, picked without touching any checkout), pushes it and opens the PR with the video attached (or on the videos branch when gh can't). Leave the two video lines out of pr.md: it adds them. Run again later: it adds only the new commits.
- It stops on a commit that conflicts on main (it leans on another task's commit): tell the lead which one.
- Your notes get the line "PR: <the url it printed>". Request changes: land the fix on \`${dev}\`, then run open again. Never fix on the task branch; never merge.`
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

export function teammateRules(flow: GitFlow, bin: string, dev: string, prRules: string): string {
  if (flow === 'dev-prs') return devTeammateRules(bin, dev)
  return flow === 'worktree-prs' ? `${prRules}\n${PR_BODY_RULES}` : directTeammateRules(bin)
}
