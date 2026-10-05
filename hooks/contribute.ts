import type { ToolSpec } from 'claude-code'

import type { Files } from './io'

// Changes to better-tasks itself: made in the user's fork, run as a linked install, offered upstream as a PR.
// The user's answer to "open a PR upstream?" is kept per user, in <claude config dir>/better-tasks/user.json,
// outside the plugin's options: the linked fork runs under another plugin id, and the answer must reach both.

export const UPSTREAM_REPO = 'iosifnicolae2/better-tasks'

/** ask: offer the PR when a change is done; never: the user chose "Never". */
export type UpstreamPr = 'ask' | 'never'

/** The answers to the question, as the tool takes them. */
export const UPSTREAM_ANSWERS = ['yes', 'not-now', 'never', 'ask'] as const
export type UpstreamAnswer = (typeof UPSTREAM_ANSWERS)[number]

export function userFile(claudeDir: string): string {
  return `${claudeDir}/better-tasks/user.json`
}

function parseUser(text: string | undefined): Record<string, unknown> {
  try {
    const json: unknown = JSON.parse(text ?? '{}')
    return typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function upstreamPrOf(text: string | undefined): UpstreamPr {
  return parseUser(text).upstreamPr === 'never' ? 'never' : 'ask'
}

type UserFiles = Pick<Files, 'read' | 'write'>

export async function readUpstreamPr(files: UserFiles, claudeDir: string): Promise<UpstreamPr> {
  return upstreamPrOf(await files.read(userFile(claudeDir)).catch(() => undefined))
}

/** Saves the answer (only "never" sticks; the rest mean ask next time), keeping the file's other keys. */
export async function saveUpstreamPr(files: UserFiles, claudeDir: string, answer: UpstreamAnswer): Promise<string> {
  const path = userFile(claudeDir)
  const user = parseUser(await files.read(path).catch(() => undefined))
  const choice: UpstreamPr = answer === 'never' ? 'never' : 'ask'
  await files.write(path, `${JSON.stringify({ ...user, upstreamPr: choice }, null, 2)}\n`)
  return ANSWER_REPLIES[answer]
}

const ANSWER_REPLIES: Record<UpstreamAnswer, string> = {
  yes: `Saved. Open the PR now: push the fork's branch, then gh pr create --repo ${UPSTREAM_REPO}. Asked again after the next change.`,
  'not-now': 'Saved: no PR now; asked again after the next change to better-tasks.',
  never: 'Saved: never asked again. The user can undo it by asking for it (upstream_pr with answer ask).',
  ask: 'Saved: asked again after the next change to better-tasks.',
}

export const UPSTREAM_PR_TOOL: ToolSpec = {
  name: 'upstream_pr',
  description:
    'Saves the user\'s answer to "open a PR to the better-tasks repo?", asked after a change to better-tasks itself ' +
    '(see "Changes to better-tasks itself" in your rules). yes or not-now: asked again next time; never: not asked again; ' +
    'ask: undoes a never. Kept per user, for every project.',
  inputSchema: {
    type: 'object',
    properties: { answer: { type: 'string', enum: [...UPSTREAM_ANSWERS] } },
    required: ['answer'],
  },
}

const PR_STEP: Record<UpstreamPr, string> = {
  ask:
    '4. The user resolved it: ask with AskUserQuestion, header "PR upstream", "Open a PR to the better-tasks repo?", ' +
    'options "Yes, open a PR" (push the branch, `gh pr create --repo ' + UPSTREAM_REPO + '`), ' +
    '"Not now" (asked again next time), "Never" (not asked again). Save the answer: upstream_pr.',
  never: '4. No PR question: the user chose "Never" (upstream_pr answer ask undoes it, only when the user asks).',
}

/** The lead's rules for a change to better-tasks itself; step 4 follows the user's saved answer. */
export function contributeRules(choice: UpstreamPr): string {
  return `## Changes to better-tasks itself
The user wants better-tasks (this plugin) changed: a task like any other; put these steps in its goal.
1. Fork: \`gh repo fork ${UPSTREAM_REPO} --clone\` into ~/.claude/better-tasks/fork (fork or clone there already: pull it).
2. Change it in the fork, on a branch named for the task; \`claude plugin test <fork>\` runs the tests.
3. Linked install, once: \`claude plugin disable better-tasks@better-tasks\`; add the fork's absolute path to \`CLAUDE_CODE_PLUGIN_DIRS\` in the \`env\` block of ~/.claude/settings.json. Every session runs the fork as it is on disk: /reload-plugins applies an edit, no reinstall. Undo: remove the path, \`claude plugin enable better-tasks@better-tasks\`.
${PR_STEP[choice]}`
}
