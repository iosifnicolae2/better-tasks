import type { Ui } from './board'
import type { Settings } from './settings'

// The settings page of the Sprint pane: one line per setting, each with the control its kind needs.

export type ConfigValue = string | number | boolean

type Base = {
  /** Which group of the page it sits in. */
  group: 'team' | 'sprint'
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
    group: 'team',
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
    group: 'team',
    field: 'worktree',
    label: 'Worktrees',
    hint: 'a git worktree per teammate',
    value: settings => settings.worktree,
    initial: false,
  },
  {
    kind: 'stepper',
    group: 'team',
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
    group: 'team',
    field: 'keepAwake',
    label: 'Keep Mac awake',
    hint: 'while teammates run',
    value: settings => settings.keepAwake,
    initial: true,
  },
  {
    kind: 'choice',
    group: 'sprint',
    field: 'sprintWeeks',
    label: 'Sprint length',
    hint: 'weeks per sprint',
    value: settings => String(settings.sprint.weeks),
    initial: '1',
    options: ['1', '2', '3', '4'].map(value => ({ value, label: value === '1' ? '1 week' : `${value} weeks` })),
    stored: value => value,
  },
  {
    kind: 'choice',
    group: 'sprint',
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
  /** The current sprint as the settings make it: "Sprint 41 · Week 41 · Mon Oct 5 – Sun Oct 11". */
  sprintPreview: string
  /** The fields this project's config.json sets; those win over /config. */
  fromProject: readonly string[]
  project: ProjectFacts
  onChange: OnChange
  onOpenNative: () => void
  onOpenSprints: () => void
  onBack: () => void
}

export function ConfigPage({ ui, settings, sprintPreview, fromProject, project, onChange, onOpenNative, onOpenSprints, onBack }: ConfigPageProps) {
  const { Box, Button, Text } = ui
  return (
    <Box flexDirection="column">
      <Text bold>Team</Text>
      {FIELDS.filter(field => field.group === 'team').map(field => (
        <FieldRow ui={ui} field={field} settings={settings} isFromProject={fromProject.includes(field.field)} onChange={onChange} />
      ))}
      <Box marginTop={1}>
        <Text bold>Sprint</Text>
      </Box>
      {FIELDS.filter(field => field.group === 'sprint').map(field => (
        <FieldRow ui={ui} field={field} settings={settings} isFromProject={fromProject.includes(field.field)} onChange={onChange} />
      ))}
      <Box paddingLeft={2} height={1} overflow="hidden">
        <Text color="suggestion" wrap="truncate-end">This sprint: {sprintPreview}</Text>
      </Box>
      <Text dimColor>• changed from the default · saved at once</Text>
      <ProjectSection ui={ui} fromProject={fromProject} project={project} />
      <Box flexDirection="row" columnGap={2} flexWrap="wrap" marginTop={1}>
        <Button key="board" plain hotkey="b" label="Board" onPress={onBack} />
        <Button key="native" plain hotkey="n" dimColor label="All settings (/config)" onPress={onOpenNative} />
        <Button key="sprints" plain hotkey="g" dimColor label="Goals & reviews (sprints.md)" onPress={onOpenSprints} />
      </Box>
    </Box>
  )
}

type FieldRowProps = { ui: Ui; field: Field; settings: Settings; isFromProject?: boolean; onChange: OnChange }

/** Marker, label, control, and the hint dim beside them. */
function FieldRow({ ui, field, settings, isFromProject, onChange }: FieldRowProps) {
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
        {isFromProject ? (
          <Text color="suggestion" wrap="truncate-end">◆ from project</Text>
        ) : (
          <Text dimColor wrap="truncate-end">{field.hint}</Text>
        )}
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

/** What the settings page knows about the project's own files in .claude/manager/. */
export type ProjectFacts = {
  /** Bad keys and other problems in config.json. */
  problems: readonly string[]
  /** The starter files the project does not have yet (paths relative to its root). */
  missing: readonly string[]
  /** The project's own files by label (config.json, coordinator.md, …) and whether each exists. */
  files: readonly { label: string; exists: boolean }[]
  onCreate: () => void
  onOpen: (label: string) => void
}

/**
 * "This project": always four lines (where values come from, problems, starter files, files to
 * open), so creating the files or fixing a key never moves the rows above.
 */
function ProjectSection({ ui, fromProject, project }: { ui: Ui; fromProject: readonly string[]; project: ProjectFacts }) {
  const { Box, Button, Text } = ui
  const line = (children: JSX.Children) => (
    <Box flexDirection="row" columnGap={2} height={1} overflow="hidden">{children}</Box>
  )
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>This project</Text>
      {line(
        fromProject.length === 0
          ? <Text dimColor>No values from .claude/manager/config.json</Text>
          : <Text color="suggestion" wrap="truncate-end">◆ {fromProject.length} from config.json; /config does not override them</Text>,
      )}
      {line(
        project.problems.length === 0
          ? <Text dimColor>config.json: no problems</Text>
          : <Text color="warning" wrap="truncate-end">⚠ {project.problems.join(' · ')}</Text>,
      )}
      {line(
        project.missing.length === 0
          ? <Text dimColor>✓ All starter files are in place</Text>
          : (
            <Box flexDirection="row" columnGap={2}>
              <Button key="init" plain hotkey="i" label={`Create ${project.missing.length} starter files`} onPress={project.onCreate} />
              <Text dimColor>↗ opens a file · + creates it, then opens it</Text>
            </Box>
          ),
      )}
      <Box flexDirection="row" columnGap={2} height={1} overflow="hidden">
        <Text dimColor>Files</Text>
        {project.files.map(file => (
          <Button key={`file-${file.label}`} plain dimColor={file.exists} label={`${file.exists ? '↗' : '+'} ${file.label}`}
            onPress={() => project.onOpen(file.label)} />
        ))}
      </Box>
    </Box>
  )
}
