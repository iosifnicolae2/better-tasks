// Sharing better-tasks with a project's team: asked once per project at setup (setting shareWithTeam).
// "Everyone" adds the marketplace and the plugin to the project's shared .claude/settings.json and commits
// that one file. Teammates who open the project in Claude Code get the marketplace and see the plugin enabled
// for the project; each installs it once (TEAMMATE_INSTALL).

export const TEAM_SETTING = 'shareWithTeam'
export const SHARED_SETTINGS = '.claude/settings.json'
export const TEAM_YES = 'Everyone on this project'
export const TEAM_NO = 'Only me'

const MARKETPLACE = 'better-tasks'
const PLUGIN = `better-tasks@${MARKETPLACE}`
const MARKETPLACE_SOURCE = { source: { source: 'github', repo: 'iosifnicolae2/better-tasks' } }

export const TEAM_QUESTION = [
  'Who on this project should get better-tasks?',
  `${TEAM_YES}: better-tasks adds itself to this project's shared Claude Code settings (${SHARED_SETTINGS}) and ` +
    'commits that one file. Push it when you are ready: teammates who open the project in Claude Code then see ' +
    'better-tasks turned on for it, and install it once.',
  `${TEAM_NO}: nothing in the project changes. better-tasks stays installed just for you.`,
  'Who should get better-tasks here?',
].join('\n\n')

export const TEAMMATE_INSTALL = `claude plugin install ${PLUGIN} --scope project`
export const TEAM_COMMIT = 'Share better-tasks with everyone on this project: Claude Code turns it on here; each teammate installs it once'

type SharedSettings = { enabledPlugins?: Record<string, unknown>; extraKnownMarketplaces?: Record<string, unknown> }

/** True when the project's shared settings already enable better-tasks. */
export function hasTeamInstall(settingsText: string | undefined): boolean {
  const settings = parse(settingsText)
  return settings !== undefined && settings.enabledPlugins?.[PLUGIN] === true
}

/** The shared settings with the marketplace and the plugin added, the rest kept; undefined when not one JSON object. */
export function withTeamInstall(settingsText: string | undefined): string | undefined {
  const settings = parse(settingsText)
  if (settings === undefined) return undefined
  const shared = {
    ...settings,
    extraKnownMarketplaces: { ...settings.extraKnownMarketplaces, [MARKETPLACE]: MARKETPLACE_SOURCE },
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
