// Sharing better-tasks with a project's team: asked once per project at setup (setting shareWithTeam).
// "Everyone" adds the marketplace and the plugin to the project's shared .claude/settings.json and commits
// that one file. Teammates who open the project in Claude Code get the marketplace and see the plugin enabled
// for the project; each installs it once (TEAMMATE_INSTALL). The marketplace entry has autoUpdate on, so Claude Code
// fetches each new release at startup and updates the plugin by itself.

export const TEAM_SETTING = 'shareWithTeam'
export const SHARED_SETTINGS = '.claude/settings.json'
export const TEAM_YES = 'Yes, everyone on this project (recommended)'
export const TEAM_NO = 'No, only me'

const MARKETPLACE = 'better-tasks'
const PLUGIN = `better-tasks@${MARKETPLACE}`
const MARKETPLACE_ENTRY = { source: { source: 'github', repo: 'iosifnicolae2/better-tasks' }, autoUpdate: true }

export const TEAM_QUESTION = 'Should we set up better-tasks in this project for other team members?'

export const TEAMMATE_INSTALL = `claude plugin install ${PLUGIN} --scope project`
export const TEAM_COMMIT = 'Share better-tasks with everyone on this project: Claude Code turns it on here; each teammate installs it once'
export const AUTO_UPDATE_COMMIT = 'Turn on better-tasks auto-update, so everyone on this project gets new releases by themselves'

type SharedSettings = { enabledPlugins?: Record<string, unknown>; extraKnownMarketplaces?: Record<string, unknown> }

/** True when the project's shared settings already enable better-tasks. */
export function hasTeamInstall(settingsText: string | undefined): boolean {
  const settings = parse(settingsText)
  return settings !== undefined && settings.enabledPlugins?.[PLUGIN] === true
}

/** True when the shared settings enable better-tasks but its marketplace entry lacks autoUpdate (set up before it existed). */
export function lacksAutoUpdate(settingsText: string | undefined): boolean {
  const entry = parse(settingsText)?.extraKnownMarketplaces?.[MARKETPLACE] as { autoUpdate?: unknown } | undefined
  return hasTeamInstall(settingsText) && entry?.autoUpdate !== true
}

/**
 * The shared settings with the marketplace (auto-updating) and the plugin added, the rest kept; a marketplace entry
 * already there keeps its source (a fork). Undefined when not one JSON object.
 */
export function withTeamInstall(settingsText: string | undefined): string | undefined {
  const settings = parse(settingsText)
  if (settings === undefined) return undefined
  const existing = settings.extraKnownMarketplaces?.[MARKETPLACE] as object | undefined
  const marketplace = { ...MARKETPLACE_ENTRY, ...existing, autoUpdate: true }
  const shared = {
    ...settings,
    extraKnownMarketplaces: { ...settings.extraKnownMarketplaces, [MARKETPLACE]: marketplace },
    enabledPlugins: { ...settings.enabledPlugins, [PLUGIN]: true },
  }
  return `${JSON.stringify(shared, null, 2)}\n`
}

function parse(text: string | undefined): SharedSettings | undefined {
  try {
    const json: unknown = JSON.parse(text ?? '{}')
    return typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as SharedSettings) : undefined
  } catch {
    return undefined
  }
}
