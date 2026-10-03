import type { AgentInfo, FsEntry } from 'claude-code'

import type { Activity, CacheStep, Task, Teammate } from '../types'
import type { CacheTtl } from './cache'
import type { Settings } from './settings'

// `$` never crosses an import (the validator refuses it), so the parts take these
// instead; each hooks file builds them from `$` in a top-level function of its own.

export type Files = {
  root: () => Promise<string>
  now: () => Promise<number>
  sessionId: () => Promise<string>
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
  list: (path: string) => Promise<FsEntry[]>
  publishTasks: (tasks: Task[]) => Promise<unknown>
  /** The project's settings (settings.ts `projectSettings`); without it the parts use the shipped defaults. */
  config?: () => Promise<Settings>
}

export type Io = Files & {
  agents: () => Promise<AgentInfo[]>
  /** The context window in tokens (the main session's model). */
  window: () => Promise<number>
  /** Context tokens per agent id, from its last step. */
  tokens: () => Promise<Record<string, number>>
  /** The current activity per agent id. */
  activities: () => Promise<Record<string, Activity>>
  /** The last request per agent id. */
  cacheSteps: () => Promise<Record<string, CacheStep>>
  /** The prompt-cache TTL teammates' requests use. */
  cacheTtl: () => Promise<CacheTtl>
  publishTeam: (team: Teammate[]) => Promise<unknown>
  /** Runs a host command by argv (no shell). */
  run: (argv: string[]) => Promise<{ exitCode: number }>
}
