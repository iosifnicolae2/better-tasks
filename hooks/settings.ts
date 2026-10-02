import type { PluginOptions } from 'claude-code'

import type { SprintConfig } from './sprints'

export type Editor = 'auto' | 'default' | 'code' | 'idea' | 'cursor' | 'zed'

export type Settings = {
  editor: Editor
  worktree: boolean
  contextLimit: number
  keepAwake: boolean
  sprint: SprintConfig
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

export function settingsOf(options: PluginOptions): Settings {
  return {
    editor: (options.editor as Editor | undefined) ?? 'auto',
    worktree: options.worktree === true,
    contextLimit: Number(options.contextLimit ?? 50),
    keepAwake: options.keepAwake !== false,
    sprint: {
      weeks: options.sprintWeeks === '2' ? 2 : 1,
      startDay: Math.max(0, WEEKDAYS.indexOf(String(options.sprintStart ?? 'monday'))),
    },
  }
}
