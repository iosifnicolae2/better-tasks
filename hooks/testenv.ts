
// Testing like a user (setting offScreen): each teammate tests and records in its own environment,
// off the user's screen when the setting is on, and reports any new bug it sees to the lead, who files it:
// every bug fix comes with a before/after video and a PR the user sees before it merges. register.tsx asks the question (askToTurnOn, once per project) and adds the rules to the prompts;
// the how-to per kind of app is the testing skill (skills/testing/SKILL.md).
// Mac apps run on the project's test screen (setting testScreen): its own virtual display by default, or a real
// screen the user picked on the settings page; bin/record-display.sh reads the choice and falls back when it is gone.

export const VIRTUAL_SCREEN = 'virtual'

// ---- The real screens, for the settings page's "Test screen" row ----

/** How long a listing of the screens stays fresh. */
export const SCREENS_FRESH_MS = 30_000

/** The real screens' names from "<id><tab><name>" lines (record-display.sh screens). */
export function screenNames(listing: string): string[] {
  return listing.split('\n').map(line => line.split('\t')[1]?.trim() ?? '').filter(Boolean)
}

export const screensArgv = (root: string) => ['/bin/sh', `${root}/bin/record-display.sh`, 'screens']
