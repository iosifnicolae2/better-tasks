import type { SessionMessage } from 'claude-code'

import type { Task, Teammate } from '../types'
import { activityOf } from './activity'
import { MateFacts } from './board'
import type { Ui } from './board'

// The teammate pane: a live, read-only look at one teammate's session in Claude Code's transcript
// style (⏺ for what it says, ⎿ for what it does), and how to switch Claude Code's own view to it.

const SHOWN = 12

export type Line = { kind: 'you' | 'says' | 'does'; text: string }

/** The newest lines of a session: messages to it, its words (first line), and each tool it used. */
export function linesOf(messages: readonly SessionMessage[], count = SHOWN): Line[] {
  const lines = messages.flatMap((message): Line[] => {
    if (message.role === 'user') {
      const text = firstLine(message.text)
      return text === '' ? [] : [{ kind: 'you', text }]
    }
    const said: Line[] = firstLine(message.text) === '' ? [] : [{ kind: 'says', text: firstLine(message.text) }]
    return [...said, ...message.toolUses.map(use => ({ kind: 'does' as const, text: activityOf(use.tool, use.input) }))]
  })
  return lines.slice(-count)
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0]?.trim() ?? ''
}

export type SessionViewProps = {
  ui: Ui
  mate?: Teammate
  task?: Task
  lines: Line[] | string
  limit: number
  onBack: () => void
}

export function SessionView({ ui, mate, task, lines, limit, onBack }: SessionViewProps) {
  const { Box, Button, Text } = ui
  if (mate === undefined) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="subtle">This teammate is no longer running.</Text>
        <Button key="back" plain hotkey="b" dimColor label="Back to the board" onPress={onBack} />
      </Box>
    )
  }
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" columnGap={1}>
        <Text color="claude">✻</Text>
        <Text bold>{mate.name}</Text>
        <MateFacts ui={ui} mate={mate} limit={limit} />
      </Box>
      {task && <Text color="subtle" wrap="truncate-end">  {task.id}  {task.title}</Text>}
      <Box flexDirection="column" marginTop={1}>
        {typeof lines === 'string' ? <Text color="subtle">{lines}</Text> : lines.map(line => <SessionLine ui={ui} line={line} />)}
        {lines.length === 0 && <Text color="subtle">Nothing yet.</Text>}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text color="subtle">To switch Claude Code to it: ↓ to {mate.name} in the agent list, Enter · Esc returns</Text>
        <Button key="back" plain hotkey="b" dimColor label="Back to the board" onPress={onBack} />
      </Box>
    </Box>
  )
}

function SessionLine({ ui, line }: { ui: Ui; line: Line }) {
  const { Box, Text } = ui
  if (line.kind === 'does') {
    return <Text color="subtle" wrap="truncate-end">  ⎿ {line.text}</Text>
  }
  return (
    <Box flexDirection="row" columnGap={1}>
      <Text color={line.kind === 'you' ? 'subtle' : 'text'}>{line.kind === 'you' ? '❯' : '⏺'}</Text>
      <Text wrap="truncate-end" color={line.kind === 'you' ? 'subtle' : undefined}>{line.text}</Text>
    </Box>
  )
}
