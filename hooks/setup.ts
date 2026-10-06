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

// ---- The user's global CLAUDE.md points to our team rules (asked once per machine) ----

export const POINTER_MARKER = '<!-- better-tasks -->'

export const POINTER_SECTION = `## Agent teams
${POINTER_MARKER}
When better-tasks is enabled, follow its coordinator and teammate rules (the plugin injects them); they take precedence over anything below about agent teams.`

export const hasPointer = (text: string) => text.includes(POINTER_MARKER)

/** What Claude is asked to do, with the user approving the edit. */
export function pointerPrompt(path: string, exists: boolean): string {
  const section = '```markdown\n' + POINTER_SECTION + '\n```'
  if (!exists) {
    return (
      `better-tasks: one-time setup of the user's global instructions. Create ${path} with the Write tool ` +
      `(the user approves it), holding only this section:\n\n${section}\n\nThen do nothing else.`
    )
  }
  return (
    `better-tasks: one-time setup of the user's global instructions. Edit ${path} with the Edit tool, so the user sees ` +
    'and approves the change:\n' +
    `1. Add this section; keep the marker line exactly:\n\n${section}\n\n` +
    '2. If the file has its own rules about agent teams, a coordinator or teammates that better-tasks now covers ' +
    '(routing, one owner per area, spawning, stopping teammates, task logs), replace them with this section. ' +
    'Keep the rules it does not cover (for example how builds are installed and reviewed) as short bullets under it. ' +
    'Leave every other section as it is.\n' +
    '3. Then do nothing else.'
  )
}
