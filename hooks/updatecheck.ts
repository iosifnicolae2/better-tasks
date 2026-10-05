// The startup update check: the newest better-tasks release (a vX.Y.Z tag of its repo) against the one this
// project pins and the one installed. Newer: asked once per version; Yes moves the pin, updates the plugin,
// then the user restarts Claude Code. Only for an install from the marketplace (a linked install is the user's own).

export const PLUGIN_ID = 'better-tasks@better-tasks'
export const MARKETPLACE_NAME = 'better-tasks'
export const UPDATE_YES = 'Yes'
export const UPDATE_NO = 'No'
export const UPDATE_HEADER = 'Update'
/** The store key holding the release the user said No to: not asked again for it. */
export const DECLINED_KEY = 'updateDeclined'

export const updateQuestion = (tag: string) => `better-tasks ${tag} is out. Update?`
export const restartLine = (tag: string) => `better-tasks: updated to ${tag}. Restart Claude Code to use it.`

/** An install Claude Code knows: its version and the scope `claude plugin update` needs. */
export type Install = { version: string; scope: string }

const TAG = /^v(\d+)\.(\d+)\.(\d+)$/

/** True for a release tag: vX.Y.Z. */
export const isReleaseTag = (ref: unknown): ref is string => typeof ref === 'string' && TAG.test(ref)

/** The release tags in `git ls-remote --tags --refs` output. */
export function releaseTags(lsRemote: string): string[] {
  return lsRemote.split('\n').map(line => line.split('refs/tags/')[1]?.trim() ?? '').filter(isReleaseTag)
}

/** True when tag `a` is a later release than `b`. */
export function isNewer(a: string, b: string): boolean {
  const [x, y] = [numbers(a), numbers(b)]
  const differing = x.findIndex((part, i) => part !== y[i])
  return differing !== -1 && (x[differing] ?? 0) > (y[differing] ?? 0)
}

export function newestTag(tags: string[]): string | undefined {
  return tags.reduce<string | undefined>((best, tag) => (best === undefined || isNewer(tag, best) ? tag : best), undefined)
}

/**
 * The install this session runs, from `claude plugin list --json`: the entry at the plugin's own folder,
 * this project's when both scopes share it. Undefined for a linked install or output that isn't the list.
 */
export function activeInstall(listJson: string, pluginRoot: string, projectRoot: string): Install | undefined {
  const entries = parseList(listJson).filter(entry => entry.id === PLUGIN_ID && trimSlash(entry.installPath) === trimSlash(pluginRoot))
  const entry = entries.find(each => each.scope !== 'user' && each.projectPath === projectRoot) ?? entries.find(each => each.scope === 'user')
  return entry && typeof entry.version === 'string' && isReleaseTag(`v${entry.version}`) ? { version: entry.version, scope: entry.scope ?? 'user' } : undefined
}

/**
 * The release to offer, or undefined when there is nothing to ask: none newer than both the installed
 * release and the project's pin, or the user already said No to it.
 */
export function offeredRelease(tags: string[], installed: string, pinned: string | undefined, declined: unknown): string | undefined {
  const newest = newestTag(tags)
  if (newest === undefined || newest === declined) return undefined
  const behind = isNewer(newest, `v${installed}`) || (pinned !== undefined && isNewer(newest, pinned))
  return behind ? newest : undefined
}

/**
 * The release to pin a project to now: the one installed when its repo has that tag (or the repo can't be
 * reached), else the repo's newest. Undefined for a linked install offline.
 */
export function pinTarget(tags: string[], installed: string | undefined): string | undefined {
  const current = installed === undefined ? undefined : `v${installed}`
  if (current !== undefined && (tags.length === 0 || tags.includes(current))) return current
  return newestTag(tags)
}

export const lsRemoteArgv = (url: string) => ['git', 'ls-remote', '--tags', '--refs', url]
export const listArgv = ['claude', 'plugin', 'list', '--json']
/** Moves the project's pinned marketplace to `tag`: the shared settings and Claude Code's copy of the marketplace. */
export const repinArgv = (source: string, tag: string) => ['claude', 'plugin', 'marketplace', 'add', `${source}#${tag}`, '--scope', 'project']
export const refreshArgv = ['claude', 'plugin', 'marketplace', 'update', MARKETPLACE_NAME]
export const updateArgv = (scope: string) => ['claude', 'plugin', 'update', PLUGIN_ID, '--scope', scope]

type ListEntry = { id?: unknown; version?: unknown; scope?: string; installPath?: unknown; projectPath?: unknown }

function parseList(text: string): ListEntry[] {
  try {
    const json: unknown = JSON.parse(text)
    return Array.isArray(json) ? (json as ListEntry[]) : []
  } catch {
    return []
  }
}

const numbers = (tag: string) => (TAG.exec(tag) ?? []).slice(1).map(Number)
const trimSlash = (path: unknown) => (typeof path === 'string' ? path.replace(/\/+$/, '') : '')
