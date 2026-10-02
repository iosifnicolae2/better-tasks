import type { Ui } from './board'
import type { Settings } from './settings'

// The settings page of the Sprint pane: one line per setting, each with the control its kind needs.

export type ConfigValue = string | number | boolean

type Base = {
  /** The userConfig field, written as `supermanager.<field>`. */
  field: string
  label: string
  hint: string
}

/** A toggle: Enter or a click flips it. */
type Toggle = Base & { kind: 'toggle'; value: (settings: Settings) => boolean; initial: boolean }

/** A stepper: − and + move it by `step` within `min`..`max`. */
type Stepper = Base & {
  kind: 'stepper'
  value: (settings: Settings) => number
  initial: number
  step: number
  min: number
  max: number
  unit: string
}

/** A picker over fixed options. */
type Choice = Base & {
  kind: 'choice'
  value: (settings: Settings) => string
  initial: string
  options: readonly { value: string; label?: string }[]
  /** The picked option as the value the setting stores. */
  stored: (value: string) => ConfigValue
}

export type Field = Toggle | Stepper | Choice

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const valuesOf = (values: readonly string[]) => values.map(value => ({ value }))

export const FIELDS: readonly Field[] = [
  {
    kind: 'choice',
    field: 'editor',
    label: 'Editor',
    hint: 'auto: the IDE Claude runs in',
    value: settings => settings.editor,
    initial: 'auto',
    options: valuesOf(['auto', 'default', 'code', 'idea', 'cursor', 'zed']),
    stored: value => value,
  },
  {
    kind: 'toggle',
    field: 'worktree',
    label: 'Worktrees',
    hint: 'a git worktree per teammate',
    value: settings => settings.worktree,
    initial: false,
  },
  {
    kind: 'stepper',
    field: 'contextLimit',
    label: 'Context limit',
    hint: 'no new work above this',
    value: settings => settings.contextLimit,
    initial: 50,
    step: 5,
    min: 10,
    max: 90,
    unit: '%',
  },
  {
    kind: 'toggle',
    field: 'keepAwake',
    label: 'Keep Mac awake',
    hint: 'while teammates run',
    value: settings => settings.keepAwake,
    initial: true,
  },
  {
    kind: 'choice',
    field: 'sprintWeeks',
    label: 'Sprint length',
    hint: 'weeks per sprint',
    value: settings => String(settings.sprint.weeks),
    initial: '1',
    options: [{ value: '1', label: '1 week' }, { value: '2', label: '2 weeks' }],
    stored: value => value,
  },
  {
    kind: 'choice',
    field: 'sprintStart',
    label: 'Sprint starts',
    hint: 'first day of a sprint',
    value: settings => WEEKDAYS[(settings.sprint.startDay + 6) % 7] ?? 'monday',
    initial: 'monday',
    options: valuesOf(WEEKDAYS),
    stored: value => value,
  },
]

export function isChanged(field: Field, settings: Settings): boolean {
  return field.value(settings) !== field.initial
}

/** The stepper's next value, kept within its bounds. */
export function stepped(field: Stepper, value: number, direction: -1 | 1): number {
  return Math.min(field.max, Math.max(field.min, value + direction * field.step))
}

// ---- Drawing ----

type OnChange = (field: string, value: ConfigValue) => void

export type ConfigPageProps = {
  ui: Ui
  settings: Settings
  onChange: OnChange
  onOpenNative: () => void
  onOpenSprints: () => void
  onBack: () => void
}

export function ConfigPage({ ui, settings, onChange, onOpenNative, onOpenSprints, onBack }: ConfigPageProps) {
  const { Box, Button, Text } = ui
  return (
    <Box flexDirection="column">
      <Text bold>Settings</Text>
      {FIELDS.map(field => (
        <FieldRow ui={ui} field={field} settings={settings} onChange={onChange} />
      ))}
      <Text dimColor>• changed from the default · saved at once</Text>
      <Box flexDirection="row" columnGap={2} flexWrap="wrap" marginTop={1}>
        <Button key="board" plain hotkey="b" label="Board" onPress={onBack} />
        <Button key="native" plain hotkey="n" dimColor label="All settings (/config)" onPress={onOpenNative} />
        <Button key="sprints" plain hotkey="g" dimColor label="Goals & reviews (sprints.md)" onPress={onOpenSprints} />
      </Box>
    </Box>
  )
}

type FieldRowProps = { ui: Ui; field: Field; settings: Settings; onChange: OnChange }

/** Marker, label, control, and the hint dim beside them. */
function FieldRow({ ui, field, settings, onChange }: FieldRowProps) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="row" columnGap={1}>
      <Text color="suggestion">{isChanged(field, settings) ? '•' : ' '}</Text>
      <Box width={15} flexShrink={0}>
        <Text>{field.label}</Text>
      </Box>
      <Box width={14} flexShrink={0}>
        <Control ui={ui} field={field} settings={settings} onChange={onChange} />
      </Box>
      <Box flexShrink={1}>
        <Text dimColor wrap="truncate-end">{field.hint}</Text>
      </Box>
    </Box>
  )
}

function Control({ ui, field, settings, onChange }: FieldRowProps) {
  const { Box, Button, Text } = ui
  if (field.kind === 'toggle') {
    const isOn = field.value(settings)
    return <Button key={field.field} plain label={isOn ? '● on' : '○ off'} onPress={() => onChange(field.field, !isOn)} />
  }
  if (field.kind === 'stepper') {
    const value = field.value(settings)
    return (
      <Box flexDirection="row" columnGap={1}>
        <Button key={`${field.field}-down`} plain label="−" onPress={() => onChange(field.field, stepped(field, value, -1))} />
        <Text>{value}{field.unit}</Text>
        <Button key={`${field.field}-up`} plain label="+" onPress={() => onChange(field.field, stepped(field, value, 1))} />
      </Box>
    )
  }
  const value = field.value(settings)
  const options = field.options.some(option => option.value === value) ? field.options : [...field.options, { value }]
  if (!('Select' in ui)) return <Text>{options.find(option => option.value === value)?.label ?? value}</Text>
  return (
    <ui.Select key={field.field} options={options} value={value}
      onSelect={picked => onChange(field.field, field.stored(picked))} />
  )
}
