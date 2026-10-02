import { atom } from 'claude-code'

import type { Task, Teammate, TurnFacts } from '../types'

// The session's shared values. Pane and status read them; their owners write.
export const tasksState = atom({ plugin: 'supermanager', key: 'tasks' } as const, [] as Task[])
export const teamState = atom({ plugin: 'supermanager', key: 'team' } as const, [] as Teammate[])
export const tokensState = atom({ plugin: 'supermanager', key: 'tokens' } as const, {} as Record<string, number>)
export const noticeState = atom({ plugin: 'supermanager', key: 'notice' } as const, '')
export const turnState = atom({ plugin: 'supermanager', key: 'turn' } as const, { asked: false, namedTime: false } as TurnFacts)
