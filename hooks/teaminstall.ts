// Sharing better-tasks with a project's team: asked once per project at setup (setting shareWithTeam).
// "Everyone" adds the marketplace and the plugin to the project's shared .claude/settings.json and commits
// that one file. Teammates who open the project in Claude Code get the marketplace and see the plugin enabled
// for the project; each installs it once (TEAMMATE_INSTALL). The marketplace is pinned to a release tag
// (source.ref) with no autoUpdate: nobody gets a release the project didn't pick. Newer releases: updatecheck.ts.

import type { GitFlow } from './gitflow'
import { isGithubRepo, isHttpsUrl, isReleaseTag } from './updatecheck'

export const TEAM_SETTING = 'shareWithTeam'
export const SHARED_SETTINGS = '.claude/settings.json'
export const TEAM_YES = 'Yes, everyone on this project (recommended)'
export const TEAM_NO = 'No, only me'

const MARKETPLACE = 'better-tasks'
const PLUGIN = `better-tasks@${MARKETPLACE}`
const UPSTREAM = { source: 'github', repo: 'iosifnicolae2/better-tasks' }

export const TEAM_QUESTION = 'Should we set up better-tasks in this project for other team members?'

export const TEAMMATE_INSTALL = `claude plugin install ${PLUGIN} --scope project`
export const TEAM_COMMIT = 'Share better-tasks with everyone on this project: Claude Code turns it on here; each teammate installs it once'
export const pinCommit = (tag: string) => `Pin better-tasks to ${tag} in the shared settings, no auto-update`
export const updateCommit = (tag: string) => `Update better-tasks to ${tag}`

type Source = { source?: unknown; repo?: unknown; url?: unknown; ref?: unknown }
type Marketplace = { source?: Source; autoUpdate?: unknown }
type SharedSettings = { enabledPlugins?: Record<string, unknown>; extraKnownMarketplaces?: Record<string, Marketplace> }

/** True when the project's shared settings already enable better-tasks. */
export function hasTeamInstall(settingsText: string | undefined): boolean {
  const settings = parse(settingsText)
  return settings !== undefined && settings.enabledPlugins?.[PLUGIN] === true
}

/** The release tag the shared settings pin better-tasks to; undefined when not pinned to one. */
export function pinnedTag(settingsText: string | undefined): string | undefined {
  const entry = marketplaceOf(settingsText)
  return isReleaseTag(entry?.source?.ref) && entry?.autoUpdate !== true ? entry.source.ref : undefined
}

/** True when the shared settings enable better-tasks unpinned: no release tag, or autoUpdate on (set up before pinning). */
export function needsPin(settingsText: string | undefined): boolean {
  return hasTeamInstall(settingsText) && pinnedTag(settingsText) === undefined
}

/**
 * The git URL of the marketplace's repo (a fork's, when the entry names one), for `git ls-remote`. A cloned repo
 * writes this file: only an owner/repo or a plain https URL is used, else upstream's (updatecheck.ts).
 */
export function repoUrl(settingsText: string | undefined): string {
  const source = marketplaceOf(settingsText)?.source
  if (source?.source === 'git' && isHttpsUrl(source.url)) return source.url
  const repo = source?.source === 'github' && isGithubRepo(source.repo) ? source.repo : UPSTREAM.repo
  return `https://github.com/${repo}.git`
}

/** The source `claude plugin marketplace add` takes for that repo (owner/repo, or the git URL). */
export function addSource(settingsText: string | undefined): string {
  const url = repoUrl(settingsText)
  return url.replace(/^https:\/\/github\.com\/(.+)\.git$/, '$1')
}

/**
 * The shared settings with the marketplace pinned to `tag` and the plugin enabled, the rest kept; a marketplace
 * entry already there keeps its source (a fork) and loses autoUpdate. Undefined when not one JSON object.
 */
export function withTeamInstall(settingsText: string | undefined, tag: string): string | undefined {
  const settings = parse(settingsText)
  if (settings === undefined) return undefined
  const { autoUpdate: _dropped, ...existing } = settings.extraKnownMarketplaces?.[MARKETPLACE] ?? {}
  const marketplace = { ...existing, source: { ...UPSTREAM, ...existing.source, ref: tag } }
  const shared = {
    ...settings,
    extraKnownMarketplaces: { ...settings.extraKnownMarketplaces, [MARKETPLACE]: marketplace },
    enabledPlugins: { ...settings.enabledPlugins, [PLUGIN]: true },
  }
  return `${JSON.stringify(shared, null, 2)}\n`
}

/**
 * Whether better-tasks may commit a settings change it made on its own (a pin, an update) here: straight to main
 * commits on the current branch; the shared dev branch only on it; a worktree per task keeps this checkout as it is.
 */
export function maySelfCommit(flow: GitFlow, branch: string, devBranch: string): boolean {
  if (flow === 'direct') return true
  return flow === 'dev-prs' && branch === devBranch
}

function marketplaceOf(settingsText: string | undefined): Marketplace | undefined {
  return parse(settingsText)?.extraKnownMarketplaces?.[MARKETPLACE]
}

function parse(text: string | undefined): SharedSettings | undefined {
  try {
    const json: unknown = JSON.parse(text ?? '{}')
    return typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as SharedSettings) : undefined
  } catch {
    return undefined
  }
}
