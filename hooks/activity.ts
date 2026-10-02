// What a teammate is doing, in a few words, from the tool it just called. Pure: register.tsx
// stores it on the teammate at tool.call; the Sprint pane shows it under the task.

const MAX = 40

const fileName = (path: unknown) => (typeof path === 'string' ? path.split('/').at(-1) ?? path : '')

const clip = (text: string) => (text.length > MAX ? `${text.slice(0, MAX - 1)}…` : text)

function field(input: unknown, name: string): unknown {
  return typeof input === 'object' && input !== null ? (input as Record<string, unknown>)[name] : undefined
}

export function activityOf(tool: string, input: unknown): string {
  switch (tool) {
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return clip(`editing ${fileName(field(input, 'file_path') ?? field(input, 'notebook_path'))}`)
    case 'Read':
      return clip(`reading ${fileName(field(input, 'file_path'))}`)
    case 'Bash':
      return clip(`running ${String(field(input, 'command') ?? '').split('\n')[0]?.trim()}`)
    case 'Grep':
    case 'Glob':
      return clip(`searching ${String(field(input, 'pattern') ?? '')}`)
    case 'WebFetch':
    case 'WebSearch':
      return 'browsing the web'
    case 'AskUserQuestion':
      return 'waiting for your answer'
    case 'SendMessage':
      return clip(`messaging ${String(field(input, 'to') ?? '')}`)
    case 'Agent':
      return 'starting a helper'
    default:
      return clip(tool.replace(/^mcp__[^_]+__/, '').replace(/_/g, ' '))
  }
}

/** The teammate's state in plain words. */
export function stateWord(status: string): string {
  const words: Record<string, string> = { running: 'working', completed: 'done', killed: 'stopped', failed: 'failed' }
  return words[status] ?? status
}
