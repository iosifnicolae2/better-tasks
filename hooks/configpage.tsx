import type { Ui } from './board'
import type { Settings } from './settings'

// The settings page of the Sprint pane, in the manner of Claude Code's own /config: one row per
// setting with its value in a fixed column; Enter (or a click) changes it in place; one line at the
// bottom describes the focused row. Nothing ever expands, so changing a value moves nothing.

export type ConfigValue = string | number | boolean

/** A setting: what it is called, what it does, its values in order, and how it is stored. */
export type Field = {
  group: 'team' | 'sprint'
  /** The userConfig field, written as `better-tasks.<field>`. */
  field: string
  label: string
  describe: string
  /** The values Enter cycles through, as shown. */
  options: readonly string[]
  /** The setting's value as one of `options`. */
  value: (settings: Settings) => string
  initial: string
  /** The shown value as the value the setting stores. */
  stored: (value: string) => ConfigValue
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const ON_OFF = ['on', 'off']
const isOn = (value: string) => value === 'on'
const asIs = (value: string) => value

export const FIELDS: readonly Field[] = [
  {
    group: 'team',
    field: 'editor',
    label: 'Editor',
    describe: 'Opens task files. auto: the IDE Claude runs in, else the default app.',
    options: ['auto', 'default', 'code', 'idea', 'cursor', 'zed'],
    value: settings => settings.editor,
    initial: 'auto',
    stored: asIs,
  },
  {
    group: 'team',
    field: 'worktree',
    label: 'Worktree per teammate',
    describe: 'Each named teammate works in its own git worktree.',
    options: ON_OFF,
    value: settings => (settings.worktree ? 'on' : 'off'),
    initial: 'off',
    stored: isOn,
  },
  {
    group: 'team',
    field: 'contextLimit',
    label: 'Context limit',
    describe: 'No new work goes to a teammate whose context is fuller than this.',
    options: ['30%', '40%', '50%', '60%', '70%'],
    value: settings => `${settings.contextLimit}%`,
    initial: '50%',
    stored: value => Number.parseInt(value, 10),
  },
  {
    group: 'team',
    field: 'keepAwake',
    label: 'Keep the Mac awake',
    describe: 'Holds caffeinate while any teammate runs.',
    options: ON_OFF,
    value: settings => (settings.keepAwake ? 'on' : 'off'),
    initial: 'on',
    stored: isOn,
  },
  {
    group: 'sprint',
    field: 'sprintWeeks',
    label: 'Sprint length',
    describe: 'How many weeks one sprint lasts.',
    options: ['1 week', '2 weeks', '3 weeks', '4 weeks'],
    value: settings => (settings.sprint.weeks === 1 ? '1 week' : `${settings.sprint.weeks} weeks`),
    initial: '1 week',
    stored: value => value.split(' ')[0] ?? '1',
  },
  {
    group: 'sprint',
    field: 'sprintStart',
    label: 'Sprint starts on',
    describe: 'The weekday a new sprint begins.',
    options: WEEKDAYS,
    value: settings => WEEKDAYS[(settings.sprint.startDay + 6) % 7] ?? 'monday',
    initial: 'monday',
    stored: asIs,
  },
]

/** The value after `current`, wrapping round; a value not in the list goes to the first. */
export function nextOption(options: readonly string[], current: string): string {
  return options[(options.indexOf(current) + 1) % options.length] ?? current
}

export function isChanged(field: Field, settings: Settings): boolean {
  return field.value(settings) !== field.initial
}

/** What the settings page knows about the project's own files in .claude/tasks/. */
export type ProjectFacts = {
  /** Bad keys and other problems in config.json. */
  problems: readonly string[]
  /** The project's own files by label (config.json, coordinator.md, …) and whether each exists. */
  files: readonly { label: string; exists: boolean }[]
  onOpen: (label: string) => void
}

export type ConfigPageProps = {
  ui: Ui
  settings: Settings
  /** The current sprint as the settings make it: "Sprint 41 · Week 41 · Mon Oct 5 – Sun Oct 11". */
  sprintPreview: string
  /** The fields this project's config.json sets; those win over /config. */
  fromProject: readonly string[]
  project: ProjectFacts
  /** The key of the row the focus ring is on, for the description line. */
  focusedRow: string
  onChange: (field: string, value: ConfigValue) => void
  onOpenNative: () => void
  onOpenSprints: () => void
  onBack: () => void
}

const FILE_ABOUT: Record<string, string> = {
  'config.json': "This project's values for any setting; they win over /config.",
  'coordinator.md': 'Replaces or extends the rules the main session coordinates by.',
  'teammate.md': 'Goes into every named teammate’s spawn prompt.',
  'task-template.md': 'The body a new task file starts with.',
}

export function ConfigPage(props: ConfigPageProps) {
  const { ui, settings, sprintPreview, fromProject, project, focusedRow, onChange, onOpenNative, onOpenSprints, onBack } = props
  const { Box, Button, Text } = ui
  const fieldRow = (field: Field) => (
    <Row ui={ui} rowKey={`cfg-${field.field}`} label={field.label} value={field.value(settings)}
      isChanged={isChanged(field, settings)} isFromProject={fromProject.includes(field.field)}
      onPress={() => onChange(field.field, field.stored(nextOption(field.options, field.value(settings))))} />
  )
  const describe = describeRow(focusedRow, fromProject, project)
  return (
    <Box flexDirection="column">
      <Heading ui={ui} title="Team" />
      {FIELDS.filter(field => field.group === 'team').map(fieldRow)}
      <Heading ui={ui} title="Sprint" />
      {FIELDS.filter(field => field.group === 'sprint').map(fieldRow)}
      <Box paddingLeft={4} height={1} overflow="hidden">
        <Text color="subtle" wrap="truncate-end">{sprintPreview}</Text>
      </Box>
      <Row ui={ui} rowKey="cfg-sprints" label="Sprint goals & reviews" value="open" onPress={onOpenSprints} />
      <Heading ui={ui} title="This project" />
      {project.files.map(file => (
        <Row ui={ui} rowKey={`file-${file.label}`} label={file.label}
          value={fileValue(file, fromProject.length)} onPress={() => project.onOpen(file.label)} />
      ))}
      {project.problems.length > 0 && (
        <Box paddingLeft={2} height={1} overflow="hidden">
          <Text color="warning" wrap="truncate-end">⚠ {project.problems.join(' · ')}</Text>
        </Box>
      )}
      <Row ui={ui} rowKey="cfg-native" label="All Claude Code settings" value="/config" onPress={onOpenNative} />
      <Box flexDirection="column" marginTop={1}>
        <Box height={1} overflow="hidden">
          <Text color="subtle" wrap="truncate-end">{describe}</Text>
        </Box>
        <Box flexDirection="row" columnGap={2} height={1} overflow="hidden">
          <Text color="subtle">↑↓ choose · ⏎ change</Text>
          <Button key="board" plain dimColor hotkey="b" label="board" onPress={onBack} />
        </Box>
      </Box>
    </Box>
  )
}

function fileValue(file: { label: string; exists: boolean }, projectValues: number): string {
  if (file.label === 'config.json') return file.exists ? `${projectValues} value${projectValues === 1 ? '' : 's'} · open` : 'none · create'
  return file.exists ? 'custom · open' : 'default · create'
}

/** The description line: what the focused row does, and where its value comes from. */
function describeRow(rowKey: string, fromProject: readonly string[], project: ProjectFacts): string {
  const field = FIELDS.find(one => `cfg-${one.field}` === rowKey)
  if (field) {
    const source = fromProject.includes(field.field) ? ' Set by this project’s config.json, which /config does not override.' : ''
    return `${field.label}: ${field.describe}${source}`
  }
  const file = rowKey.startsWith('file-') ? rowKey.slice('file-'.length) : undefined
  if (file !== undefined) {
    const exists = project.files.find(one => one.label === file)?.exists === true
    return `${file}: ${FILE_ABOUT[file] ?? ''} ⏎ ${exists ? 'opens it' : 'creates it from the shipped text, then opens it'}.`
  }
  if (rowKey === 'cfg-sprints') return 'Sprint goals & reviews: opens sprints.md, one section per sprint.'
  if (rowKey === 'cfg-native') return "All Claude Code settings: opens /config; this plugin's rows read “Better Tasks: …”."
  return 'Values are saved as soon as they change · • differs from the default · ◆ set by this project'
}

function Heading({ ui, title }: { ui: Ui; title: string }) {
  const { Box, Text } = ui
  return (
    <Box marginTop={1} height={1}>
      <Text bold color="subtle">{title}</Text>
    </Box>
  )
}

type RowProps = {
  ui: Ui
  rowKey: string
  label: string
  value: string
  isChanged?: boolean
  isFromProject?: boolean
  onPress: () => void
}

/** "  • Editor                    auto": marker, the label (the focusable part), the value in its column. */
function Row({ ui, rowKey, label, value, isChanged, isFromProject, onPress }: RowProps) {
  const { Box, Button, Text } = ui
  return (
    <Box flexDirection="row" height={1} overflow="hidden">
      <Box width={2} flexShrink={0}>
        <Text color="suggestion">{isFromProject ? '◆' : isChanged ? '•' : ' '}</Text>
      </Box>
      <Box width={28} flexShrink={0}>
        <Button key={rowKey} plain label={label} onPress={onPress} />
      </Box>
      <Text color={isChanged || isFromProject ? 'suggestion' : 'subtle'} wrap="truncate-end">{value}</Text>
    </Box>
  )
}
