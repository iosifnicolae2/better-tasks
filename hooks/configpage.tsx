import { KeyHint } from './board'
import type { Ui } from './board'
import { FLOW_LABELS, GIT_FLOWS } from './gitflow'
import { EFFORTS, LEVELS, MODELS, VIDEO_QUALITIES } from './settings'
import type { Level, Settings, VideoQuality } from './settings'
import { VIRTUAL_SCREEN } from './testenv'

// The settings page of the Sprint pane, in the manner of Claude Code's own /config: one row per
// setting with its value in a fixed column; Enter (or a click) changes it in place; one line at the
// bottom describes the focused row. Nothing ever expands, so changing a value moves nothing.

export type ConfigValue = string | number | boolean

/** The page's groups, in order, each under its own heading. */
export const GROUPS = [
  { id: 'general', title: 'General' },
  { id: 'git', title: 'Git & PRs' },
  { id: 'testing', title: 'Testing & videos' },
  { id: 'models', title: 'Teammate models' },
  { id: 'sprint', title: 'Sprint' },
] as const
export type Group = (typeof GROUPS)[number]['id']

/** A setting: what it is called, what it does, its values in order, and how it is stored. */
export type Field = {
  group: Group
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
const VIRTUAL_LABEL = 'virtual display'
const QUALITY_LABELS: Record<VideoQuality, string> = { low: '720p small', medium: '1080p medium', high: '1080p high' }

const LEVEL_ABOUT: Record<Level, { label: string; work: string; effort: string }> = {
  easy: { label: 'Easy-task', work: 'quick, clear work: a typo, a text, a small fix', effort: 'low' },
  normal: { label: 'Normal-task', work: 'an ordinary feature or bug fix', effort: 'medium' },
  hard: { label: 'Hard-task', work: 'deep debugging, security work, changes across several areas', effort: 'high' },
}

/** A level's two rows: the model teammates run on, and how hard they think. */
function modelFields(level: Level): Field[] {
  const { label, work, effort } = LEVEL_ABOUT[level]
  return [
    {
      group: 'models',
      field: `${level}Model`,
      label: `${label} model`,
      describe: `The model teammates run on for ${work}. inherit: the manager’s own.`,
      options: MODELS,
      value: settings => settings.models[level].model,
      initial: 'opus',
      stored: asIs,
    },
    {
      group: 'models',
      field: `${level}Effort`,
      label: `${label} effort`,
      describe: `How hard teammates think on ${work}.`,
      options: EFFORTS,
      value: settings => settings.models[level].effort,
      initial: effort,
      stored: asIs,
    },
  ]
}

export const FIELDS: readonly Field[] = [
  {
    group: 'general',
    field: 'editor',
    label: 'Editor',
    describe: 'Opens task files. auto: the IDE Claude runs in, else the default app.',
    options: ['auto', 'default', 'code', 'idea', 'cursor', 'zed'],
    value: settings => settings.editor,
    initial: 'auto',
    stored: asIs,
  },
  {
    group: 'git',
    field: 'gitFlow',
    label: 'Git flow',
    describe: 'How teammates’ work reaches main. Straight to main: one checkout, no PRs. Shared dev branch: one checkout on dev, a PR per task. Worktree: a copy and a PR each. Saved in this project’s config.json.',
    options: GIT_FLOWS.map(flow => FLOW_LABELS[flow]),
    value: settings => FLOW_LABELS[settings.gitFlow],
    initial: FLOW_LABELS.direct,
    stored: label => GIT_FLOWS.find(flow => FLOW_LABELS[flow] === label) ?? 'direct',
  },
  {
    group: 'general',
    field: 'longCache',
    label: '1-hour prompt cache',
    describe: 'Teammates and the manager keep their prompt cache for an hour, so a teammate stays cheap to resume.',
    options: ON_OFF,
    value: settings => (settings.longCache ? 'on' : 'off'),
    initial: 'on',
    stored: isOn,
  },
  {
    group: 'general',
    field: 'statusEvery',
    label: 'Status check',
    describe: 'After this many quiet minutes the manager checks the open work and moves it forward. off: never.',
    options: ['off', 'every 10 min', 'every 20 min', 'every 30 min', 'every 60 min'],
    value: settings => (settings.statusEvery > 0 ? `every ${settings.statusEvery} min` : 'off'),
    initial: 'every 10 min',
    stored: value => (value === 'off' ? 0 : Number.parseInt(value.replace('every ', ''), 10)),
  },
  {
    group: 'general',
    field: 'keepAwake',
    label: 'Keep the Mac awake',
    describe: 'Holds caffeinate while any teammate runs.',
    options: ON_OFF,
    value: settings => (settings.keepAwake ? 'on' : 'off'),
    initial: 'on',
    stored: isOn,
  },
  {
    group: 'git',
    field: 'openPrInBrowser',
    label: 'Open PRs in the browser',
    describe: 'When the manager asks you to approve a finished task, it first opens that task’s PR in your default browser.',
    options: ON_OFF,
    value: settings => (settings.openPrInBrowser ? 'on' : 'off'),
    initial: 'on',
    stored: isOn,
  },
  {
    group: 'testing',
    field: 'demoVideos',
    label: 'Before/after videos',
    describe: 'Finished work comes with a short narrated video: the bug, then the fix, marked in red. Sets up the Kokoro voice once.',
    options: ON_OFF,
    value: settings => (settings.demoVideos ? 'on' : 'off'),
    initial: 'off',
    stored: isOn,
  },
  {
    group: 'testing',
    field: 'videoQuality',
    label: 'Video quality',
    describe: 'The before/after videos’ size: 720p small file, 1080p medium (sharp, a few MB a minute), 1080p high (sharper, bigger file).',
    options: Object.values(QUALITY_LABELS),
    value: settings => QUALITY_LABELS[settings.videoQuality],
    initial: QUALITY_LABELS.medium,
    stored: label => VIDEO_QUALITIES.find(quality => QUALITY_LABELS[quality] === label) ?? 'medium',
  },
  {
    group: 'testing',
    field: 'releaseVideos',
    label: 'Release videos',
    describe: 'A release comes with one narrated video of everything it ships: each task’s before/after video, linked from the release notes. Saved in this project.',
    options: ON_OFF,
    value: settings => (settings.releaseVideos ? 'on' : 'off'),
    initial: 'on',
    stored: isOn,
  },
  {
    group: 'testing',
    field: 'offScreen',
    label: 'Test off-screen',
    describe: 'Teammates test and record in a hidden browser, simulator or terminal, so your screen, mouse and keyboard stay yours. Saved in this project.',
    options: ON_OFF,
    value: settings => (settings.offScreen ? 'on' : 'off'),
    initial: 'on',
    stored: isOn,
  },
  testScreenField([]),
  ...LEVELS.flatMap(modelFields),
  {
    group: 'models',
    field: 'escalate',
    label: 'Escalate when stuck',
    describe: 'A teammate that fails or goes in circles is replaced by one a level up: easy to normal, normal to hard.',
    options: ON_OFF,
    value: settings => (settings.models.escalate ? 'on' : 'off'),
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

/** The "Test screen" row: the virtual display, then each connected real screen by name. */
export function testScreenField(screens: readonly string[]): Field {
  const shown = (screen: string) =>
    screen === VIRTUAL_SCREEN ? VIRTUAL_LABEL : screens.includes(screen) ? screen : `${screen} · not connected`
  return {
    group: 'testing',
    field: 'testScreen',
    label: 'Test screen',
    describe: 'Where teammates test and record Mac apps: this project’s own virtual display, kept off your screens, or one of your screens. Not connected: the virtual display. Saved in this project.',
    options: [VIRTUAL_LABEL, ...screens],
    value: settings => shown(settings.testScreen),
    initial: VIRTUAL_LABEL,
    stored: label => (label === VIRTUAL_LABEL ? VIRTUAL_SCREEN : label),
  }
}

/** Every row, the "Test screen" one with the screens connected now. */
export function fieldsWith(screens: readonly string[]): readonly Field[] {
  return FIELDS.map(field => (field.field === 'testScreen' ? testScreenField(screens) : field))
}

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
  /** The PR description's template (prtemplate.ts): its path as shown, and whose it is. */
  prTemplate: { shown: string; source: 'custom' | 'project' | 'shipped' }
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
  /** The real screens connected now, by name (testenv.ts connectedScreens). */
  screens?: readonly string[]
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
  const { ui, settings, sprintPreview, fromProject, project, focusedRow, screens = [], onChange, onOpenNative, onOpenSprints, onBack } = props
  const { Box, Button, Text } = ui
  const fields = fieldsWith(screens)
  const fieldRow = (field: Field) => (
    <Row ui={ui} rowKey={`cfg-${field.field}`} label={field.label} value={field.value(settings)}
      isChanged={isChanged(field, settings)} isFromProject={fromProject.includes(field.field)}
      onPress={() => onChange(field.field, field.stored(nextOption(field.options, field.value(settings))))} />
  )
  const describe = describeRow(fields, focusedRow, fromProject, project)
  return (
    <Box flexDirection="column">
      {GROUPS.map(group => [
        <Heading ui={ui} title={group.title} />,
        ...fields.filter(field => field.group === group.id).map(fieldRow),
      ])}
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
      <Row ui={ui} rowKey="cfg-instructions" label="Project instructions" value={settings.instructions || 'none · set in config.json'}
        isFromProject={fromProject.includes('instructions')} onPress={() => project.onOpen('instructions')} />
      <Row ui={ui} rowKey="cfg-pr-template" label="PR template" value={prTemplateValue(project.prTemplate)}
        isFromProject={fromProject.includes('prTemplate')} onPress={() => project.onOpen('pr-template')} />
      <Row ui={ui} rowKey="cfg-native" label="All Claude Code settings" value="/config" onPress={onOpenNative} />
      <Box flexDirection="column" marginTop={1}>
        <Box height={1} overflow="hidden">
          <Text color="subtle" wrap="truncate-end">{describe}</Text>
        </Box>
        <Box flexDirection="row" columnGap={2} height={1} overflow="hidden">
          <KeyHint ui={ui} keys="↑↓" word="choose" />
          <KeyHint ui={ui} keys="⏎" word="change" />
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

function prTemplateValue(template: ProjectFacts['prTemplate']): string {
  return template.source === 'shipped' ? 'better-tasks’ · add to repo' : `${template.shown} · open`
}

/** The description line: what the focused row does, and where its value comes from. */
function describeRow(fields: readonly Field[], rowKey: string, fromProject: readonly string[], project: ProjectFacts): string {
  const field = fields.find(one => `cfg-${one.field}` === rowKey)
  if (field) {
    const source = fromProject.includes(field.field) ? ' Set by this project’s config.json, which /config does not override.' : ''
    return `${field.label}: ${field.describe}${source}`
  }
  const file = rowKey.startsWith('file-') ? rowKey.slice('file-'.length) : undefined
  if (file !== undefined) {
    const exists = project.files.find(one => one.label === file)?.exists === true
    return `${file}: ${FILE_ABOUT[file] ?? ''} ⏎ ${exists ? 'opens it' : 'creates it from the shipped text, then opens it'}.`
  }
  if (rowKey === 'cfg-instructions') {
    return 'Project instructions: files or folders every teammate and the lead follow, as "instructions" in config.json (comma-separated). The prompts get each path and its first line. ⏎ opens the first one, or config.json.'
  }
  if (rowKey === 'cfg-pr-template') {
    const action = project.prTemplate.source === 'shipped'
      ? 'This project has none, so PRs use better-tasks’ own. ⏎ adds it as .github/pull_request_template.md and opens it.'
      : '⏎ opens it.'
    return `PR template: what every PR description fills in: the request and why at the top, then the video, what changed, how to test. A path of your own: "prTemplate" in config.json; else the project’s, else better-tasks’. ${action}`
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
