// First load: the mod needs agent teams. It never writes settings itself; Claude does, with the user's approval.

export const TEAMS_FLAG = 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'

/** on: this process has it; restart: settings have it, this process not yet; missing: nowhere. */
export type TeamsState = 'on' | 'restart' | 'missing'

export function teamsState(inProcess: string | undefined, settingsEnv: unknown): TeamsState {
  if (inProcess === '1') return 'on'
  const env = (settingsEnv ?? {}) as Record<string, unknown>
  return env[TEAMS_FLAG] === '1' ? 'restart' : 'missing'
}

export const RESTART_TEXT = 'Agent teams set: restart the session to turn them on'

export const SETUP_PROMPT =
  'The better-tasks mod needs Claude Code agent teams, which are off in this session. ' +
  `Add "${TEAMS_FLAG}": "1" to the "env" block of ~/.claude/settings.json with the Edit tool ` +
  '(create the block if it is missing; keep everything else in the file as it is). ' +
  'Then ask the user with AskUserQuestion to restart the session (exit, then start `claude` again with the same flags), ' +
  'options "I\'ll restart" and "Skip". ' +
  'Do nothing else until then.'

/** The one line the coordinator reads beside a prompt while teams are off. */
export function waitingLine(state: TeamsState): string {
  return state === 'restart'
    ? `[better-tasks] off until restart: ${TEAMS_FLAG}=1 is in settings but not in this session.`
    : `[better-tasks] off: agent teams are not set up (${TEAMS_FLAG}=1).`
}

// ---- Older versions pointed the user's global CLAUDE.md at our rules; that section is taken out ----
// It stayed in the user's instructions while better-tasks was disabled. The rules now say themselves what they override.

export const POINTER_MARKER = '<!-- better-tasks -->'

const POINTER_LINE = 'When better-tasks is enabled, follow its coordinator and teammate rules'

/** The text without our section (the marker, our line, and its heading when nothing else is under it); undefined when it has none. */
export function withoutPointer(text: string): string | undefined {
  const lines = text.split('\n')
  const at = lines.indexOf(POINTER_MARKER)
  if (at === -1) return undefined
  const end = lines[at + 1]?.startsWith(POINTER_LINE) ? at + 2 : at + 1
  const isOnlyOurs = lines[at - 1]?.startsWith('## ') === true && isBlankUntilHeading(lines.slice(end))
  return tidy([...lines.slice(0, isOnlyOurs ? at - 1 : at), ...lines.slice(end)].join('\n'))
}

function isBlankUntilHeading(lines: string[]): boolean {
  const next = lines.findIndex(line => line.startsWith('#'))
  return (next === -1 ? lines : lines.slice(0, next)).every(line => line.trim() === '')
}

const tidy = (text: string) => text.replace(/\n{3,}/g, '\n\n').trim() + '\n'
