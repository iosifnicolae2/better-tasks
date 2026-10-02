import type { Ui } from './board'
import type { Settings } from './settings'

// The config page of the Tasks pane: one row per setting (label, picker, a one-line hint).

export type ConfigValue = string | number | boolean

type Field = {
  /** The userConfig field, written as `supermanager.<field>`. */
  field: string
  label: string
  hint: string
  options: readonly { value: string; label?: string }[]
  /** The setting's value as one of `options`. */
  current: (settings: Settings) => string
  /** The picked option as the value the setting stores. */
  stored: (value: string) => ConfigValue
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const ON_OFF = [{ value: 'on' }, { value: 'off' }]
const LIMITS = ['30', '40', '50', '60', '70', '80']
const asIs = (value: string) => value
const valuesOf = (values: readonly string[]) => values.map(value => ({ value }))

export const FIELDS: readonly Field[] = [
  {
    field: 'editor',
    label: 'Editor',
    hint: 'Opens task files. auto: the IDE Claude runs in, else the default app.',
    options: valuesOf(['auto', 'default', 'code', 'idea', 'cursor', 'zed']),
    current: settings => settings.editor,
    stored: asIs,
  },
  {
    field: 'worktree',
    label: 'Worktrees',
    hint: 'Each teammate works in its own git worktree.',
    options: ON_OFF,
    current: settings => (settings.worktree ? 'on' : 'off'),
    stored: value => value === 'on',
  },
  {
    field: 'contextLimit',
    label: 'Context limit',
    hint: 'No new work goes to a teammate whose context is fuller than this.',
    options: LIMITS.map(value => ({ value, label: `${value}%` })),
    current: settings => String(settings.contextLimit),
    stored: Number,
  },
  {
    field: 'keepAwake',
    label: 'Keep Mac awake',
    hint: 'Holds caffeinate while any teammate runs.',
    options: ON_OFF,
    current: settings => (settings.keepAwake ? 'on' : 'off'),
    stored: value => value === 'on',
  },
  {
    field: 'sprintWeeks',
    label: 'Sprint length',
    hint: 'How long one sprint lasts.',
    options: [{ value: '1', label: '1 week' }, { value: '2', label: '2 weeks' }],
    current: settings => String(settings.sprint.weeks),
    stored: asIs,
  },
  {
    field: 'sprintStart',
    label: 'Sprint starts',
    hint: 'The weekday a new sprint begins.',
    options: valuesOf(WEEKDAYS),
    current: settings => WEEKDAYS[(settings.sprint.startDay + 6) % 7] ?? 'monday',
    stored: asIs,
  },
]

export type ConfigPageProps = {
  ui: Ui
  settings: Settings
  onChange: (field: string, value: ConfigValue) => void
  onOpenSprints: () => void
  onBack: () => void
}

export function ConfigPage({ ui, settings, onChange, onOpenSprints, onBack }: ConfigPageProps) {
  const { Box, Button, Text } = ui
  return (
    <Box flexDirection="column">
      <Text bold>Settings</Text>
      {FIELDS.map(field => (
        <FieldRow ui={ui} field={field} settings={settings} onChange={onChange} />
      ))}
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Sprint goals and reviews</Text>
        <Button key="sprints" plain label="Open sprints.md" onPress={onOpenSprints} />
      </Box>
      <Box marginTop={1}>
        <Button key="board" plain hotkey="b" dimColor label="Back to the board" onPress={onBack} />
      </Box>
    </Box>
  )
}

type FieldRowProps = { ui: Ui; field: Field; settings: Settings; onChange: ConfigPageProps['onChange'] }

function FieldRow({ ui, field, settings, onChange }: FieldRowProps) {
  const { Box, Text } = ui
  const current = field.current(settings)
  const options = field.options.some(option => option.value === current)
    ? field.options
    : [...field.options, { value: current }]
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <Box width={16} flexShrink={0}>
          <Text>{field.label}</Text>
        </Box>
        {'Select' in ui ? (
          <ui.Select key={field.field} options={options} value={current}
            onSelect={value => onChange(field.field, field.stored(value))} />
        ) : (
          <Text>{options.find(option => option.value === current)?.label ?? current}</Text>
        )}
      </Box>
      <Text dimColor>{field.hint}</Text>
    </Box>
  )
}
