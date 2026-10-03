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
  'Then tell the user to restart the session: exit, then start `claude` again with the same flags. ' +
  'Do nothing else until then.'

/** The one line the coordinator reads beside a prompt while teams are off. */
export function waitingLine(state: TeamsState): string {
  return state === 'restart'
    ? `[better-tasks] off until restart: ${TEAMS_FLAG}=1 is in settings but not in this session.`
    : `[better-tasks] off: agent teams are not set up (${TEAMS_FLAG}=1).`
}
