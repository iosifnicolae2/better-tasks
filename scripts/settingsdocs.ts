// The text of the settings skill (skills/settings/SKILL.md): one entry per setting, rendered with the
// choices and defaults from hooks/settings.ts and the /config rows from plugin.json. Pure: the tests import it.
// Write the skill: `bun scripts/settings-doc.ts`; check it is current: `bun scripts/settings-doc.ts --check`.
import { DEFAULTS, FIELDS, PROJECT_KEYS } from '../hooks/settings'

/** The settings page's groups (hooks/configpage.tsx GROUPS), then what only config.json sets. */
type Group = 'General' | 'Git & PRs' | 'Testing & videos' | 'Teammate models' | 'Sprint' | 'Task files and paths'

type Doc = {
  group: Group
  /** What it means, in plain words; choices explained when their names don't say it. */
  about: string
}

/** Every key of hooks/settings.ts FIELDS, in the order the skill lists them. */
export const SETTING_DOCS: Record<string, Doc> = {
  editor: { group: 'General', about: 'Opens task files from the board. auto: IntelliJ in a JetBrains terminal, VS Code in VS Code, else the default app.' },
  gitFlow: {
    group: 'Git & PRs',
    about: 'How teammates\' work reaches main. worktree-prs ("Worktree and PR per task"), the default: each teammate its own git worktree, branch and PR, merged once the user approves it. dev-prs ("Shared dev branch, PR per task"): everyone commits on the dev branch in one checkout, a PR per task. direct ("Straight to main"): small commits on main, no branches, no PRs except a bug fix\'s (its own worktree and PR). Asked once per project at the first start, with a GitHub remote; without one, no PRs, so direct.',
  },
  worktreeSandbox: { group: 'Git & PRs', about: 'How a teammate\'s worktree is made (the worktree flows, and a bug fix\'s own worktree). false, the default: better-tasks makes it with git where Claude Code would (.claude/worktrees/<teammate>, branch worktree-<teammate>, from the same base, .worktreeinclude copied) and spawns the teammate without isolation, so Claude Code\'s worktree checks don\'t refuse its commands ("too complex to verify": subshells, variables, heredocs) or the edit of its task file; its rules keep it in its worktree. true: Claude Code\'s isolated worktree, with those checks, which can\'t be turned off. Permissions are the user\'s either way: nothing is allowed that wasn\'t.' },
  devBranch: { group: 'Git & PRs', about: 'The shared branch of the dev-prs git flow.' },
  longCache: { group: 'General', about: '1-hour prompt cache for teammates and the lead, so a teammate stays cheap to resume. Unless you set a cache TTL yourself.' },
  statusEvery: { group: 'General', about: 'Minutes of quiet before the lead checks the open work and moves it forward; only while a task is running (status doing). 0: off.' },
  maxTeammates: { group: 'General', about: 'Teammates alive at once (working or idle). At the limit a new spawn is refused: the lead gives the task to an owner of similar work (a teammate may own several tasks, done one after another) or waits for one to finish. 0: no limit.' },
  keepAwake: { group: 'General', about: 'Holds caffeinate (the Mac stays awake) while any teammate runs.' },
  openPrInBrowser: { group: 'Git & PRs', about: 'When the lead asks the user about a finished task, it first opens that task\'s PR in the default browser (once its video is uploaded) and waits a few seconds for the page to load. Never after the user answered.' },
  demoVideos: { group: 'Testing & videos', about: 'Every finished task comes with a short narrated before/after video (red boxes, arrows, subtitles read aloud by Kokoro, set up once per machine). Asked once per project.' },
  videoQuality: { group: 'Testing & videos', about: 'The videos\' size: low = 720p small file, medium = 1080p (a few MB a minute), high = 1080p sharper, bigger file.' },
  releaseVideos: { group: 'Testing & videos', about: 'A release comes with one narrated video of everything it ships: a card per task, then that task\'s own before/after video (before: the code before the task, so the previous release for that feature). Linked at the top of the release notes. Made by `bin/release-video.sh` (better-tasks\' own `scripts/release.sh` runs it); tasks without a video are listed on the opening card. false: the release goes out without one. Not asked.' },
  offScreen: { group: 'Testing & videos', about: 'Teammates test and record in a hidden browser, simulator or terminal, so the screen, mouse and keyboard stay the user\'s. On by default, not asked.' },
  testScreen: { group: 'Testing & videos', about: 'The screen teammates test and record Mac apps on. virtual: the project\'s own virtual display, kept below the user\'s screens. Else a real screen\'s name as the settings page lists it ("Built-in Retina Display", "DELL U2720Q"); not connected: the virtual display, and the teammate tells the user. Not asked: change it on the settings page\'s "Test screen" row.' },
  batchDeviceTests: { group: 'Testing & videos', about: 'When builds or device tests are slow, the lead gives each task its own instance (simulator, emulator, app copy, test user) where it can, tested in parallel; where it can\'t, tasks from areas that don\'t interact share one build, a change that must be tested on its own or may clash behind its own short-lived feature flag (off by default, a launch argument or env var). Each flag and its old path come out once its task is confirmed working.' },
  liveReview: { group: 'Testing & videos', about: 'While a teammate tests on the test screen (`bin/live-review.sh`), Gemini watches it live and reports, each at its second in the recording, what the teammate asked it to check and anything else not OK; the teammate then reviews those moments, and the reports can go on the before/after video. Sends only the test display\'s changed frames (masks blacked out, 1280 px wide) to Google\'s Gemini Live API under the user\'s own AI Studio key (the `geminiKey` row below). About $0.02 a minute. Not asked.' },
  excludeWorktreesFromIde: { group: 'General', about: 'IntelliJ skips .claude/worktrees/ from the first run, so teammates\' worktrees don\'t set off re-indexing (git ignores them too: .gitignore). On by default, not asked.' },
  prTemplate: { group: 'Git & PRs', about: 'The template every PR description fills in: a path relative to the project root. Empty: the project\'s own (.github/pull_request_template.md and the other places GitHub and GitLab look), else better-tasks\' (the request and why on top, then the video, what changed, how to test, notes, commits). The settings page\'s "PR template" row opens it, or adds better-tasks\' one to the repo as .github/pull_request_template.md.' },
  useBetterTasks: { group: 'General', about: 'Use better-tasks in this project at all. false: it stays quiet here (no tools, no task rules, no setup questions; only its commands). Not asked: set it in config.json, then restart.' },
  shareWithTeam: { group: 'General', about: 'Who gets better-tasks in this project. true: it is in the project\'s shared .claude/settings.json (committed, not pushed), so teammates who open the project see it turned on, install it once, and get the release it pins (source.ref, a release tag; no autoUpdate). A newer release: asked at startup, Yes moves the pin. false: only this user has it. Asked once per git project.' },
  worktree: { group: 'Git & PRs', about: 'Old switch, kept for projects that set it: with gitFlow direct, each named teammate works in its own worktree. Use gitFlow instead.' },
  pullRequests: { group: 'Git & PRs', about: 'Old switch, kept for projects that set it: true reads as gitFlow worktree-prs. Use gitFlow instead.' },
  easyModel: { group: 'Teammate models', about: 'Model for easy tasks (a typo, a text, a small fix). inherit: the lead\'s own model.' },
  easyEffort: { group: 'Teammate models', about: 'How hard teammates think on easy tasks.' },
  normalModel: { group: 'Teammate models', about: 'Model for normal tasks (an ordinary feature or bug fix). inherit: the lead\'s own model.' },
  normalEffort: { group: 'Teammate models', about: 'How hard teammates think on normal tasks.' },
  hardModel: { group: 'Teammate models', about: 'Model for hard tasks (deep debugging, security, changes across several areas). inherit: the lead\'s own model.' },
  hardEffort: { group: 'Teammate models', about: 'How hard teammates think on hard tasks.' },
  escalate: { group: 'Teammate models', about: 'A teammate that fails or goes in circles is replaced by one a level up: easy to normal, normal to hard.' },
  sprintWeeks: { group: 'Sprint', about: 'How many weeks one sprint lasts.' },
  sprintStart: { group: 'Sprint', about: 'The weekday a sprint starts.' },
  taskPrefix: { group: 'Task files and paths', about: 'The id\'s prefix: "T-" in "T-001".' },
  taskPadding: { group: 'Task files and paths', about: 'Digits in the id, zero-padded: 3 gives "001".' },
  taskStart: { group: 'Task files and paths', about: 'The first task\'s number.' },
  taskFileName: { group: 'Task files and paths', about: 'A task\'s file name; {id}, {slug} and {title} are filled in.' },
  tasksFolder: { group: 'Task files and paths', about: 'Folder of the task files, from the project root.' },
  logFile: { group: 'Task files and paths', about: 'The finished-task log, from the project root.' },
  sprintsFile: { group: 'Task files and paths', about: 'Sprint goals and reviews, from the project root.' },
}

/** Keys of settings.ts FIELDS with no entry above, and entries for keys it doesn't have. */
export function docGaps(): { undocumented: string[]; unknown: string[] } {
  return {
    undocumented: Object.keys(FIELDS).filter(key => !(key in SETTING_DOCS)),
    unknown: Object.keys(SETTING_DOCS).filter(key => !(key in FIELDS)),
  }
}

/** The plugin.json userConfig fields (shown in /config) that the docs read: a title per key. */
export type UserConfig = Record<string, { title?: string }>

const GROUPS: Group[] = ['General', 'Git & PRs', 'Testing & videos', 'Teammate models', 'Sprint', 'Task files and paths']

function whereOf(key: string, userConfig: UserConfig): string {
  if (key in userConfig && !PROJECT_KEYS.includes(key)) return `/config "${userConfig[key]?.title}" or config.json`
  return 'config.json'
}

function choicesOf(key: string): string {
  const field = FIELDS[key]
  if (field?.values) return field.values.join(', ')
  return field?.kind === 'boolean' ? 'true, false' : (field?.kind ?? '')
}

const cell = (text: string) => text.replaceAll('|', '\\|')

function row(key: string, userConfig: UserConfig): string {
  const doc = SETTING_DOCS[key]
  if (!doc) return ''
  const shown = JSON.stringify(DEFAULTS[key])
  return `| \`${key}\` | ${cell(doc.about)} | ${cell(choicesOf(key))} | ${cell(shown)} | ${whereOf(key, userConfig)} |`
}

function table(group: Group, userConfig: UserConfig): string {
  const keys = Object.keys(SETTING_DOCS).filter(key => SETTING_DOCS[key]?.group === group)
  return [`## ${group}`, '', '| Key | What it means | Choices | Default | Where |', '|---|---|---|---|---|', ...keys.map(key => row(key, userConfig))].join('\n')
}

const HEAD = `---
name: settings
description: Every better-tasks setting, what each one means, its choices and default, where it is saved and how to change it. Load it when the user asks what better-tasks can be configured to do, asks about a setting (git flow, teammate models, videos, off-screen testing, the test screen, sprint length, editor, task ids, PR upstream), or wants one changed.
---

# better-tasks settings
Every setting of the better-tasks plugin, one row each. Generated by \`bun scripts/settings-doc.ts\` from hooks/settings.ts and plugin.json: don't edit by hand.
Grep a key (\`gitFlow\`) or a word (\`video\`) to find its row.

## Where a value lives
- **Per user, every project:** Claude Code's \`/config\` (rows "Better Tasks: …"), or the settings page: \`/better-tasks config\`, or \`c\` on the sprint board. It shows the groups below.
- **Per project:** \`.claude/tasks/config.json\`, one JSON object; keys starting with \`//\` are comments. Any key below may go there and wins over \`/config\`. Keys whose "Where" is only config.json live there alone (the settings page writes them there).
- Order: shipped default < \`/config\` < config.json. A bad key or value is skipped and shown on the settings page.

## How to change one
- The user: \`/better-tasks config\` (Enter cycles a row's value), or \`/config\`.
- An agent: set the key in \`.claude/tasks/config.json\`, keeping the other keys, e.g. \`{ "gitFlow": "dev-prs" }\`. Confirm the choice with the user first.
`

const TAIL = `## Per user, outside /config
| Key | What it means | Choices | Default | Where |
|---|---|---|---|---|
| \`geminiKey\` | The key live review sends frames under: a key of an AI Studio project with billing on (Plan "Paid" at aistudio.google.com/apikey), since on the free tier Google may use what is sent to improve its products, and people may review it (the Gemini API terms, "Unpaid Services"). One for every project, or a project's own, which wins. Never in a file. | a key | none | the macOS Keychain, service "better-tasks gemini", account "global" or the project's root; set on the settings page's "Gemini API key" row, or \`bin/live-review.sh key set [--project]\` |
| \`upstreamPr\` | After a change to better-tasks itself (made in the user's fork), offer a PR to the better-tasks repo. never: not asked again. | ask, never | "ask" | \`<claude config dir>/better-tasks/user.json\`; set with the \`upstream_pr\` tool (answer \`ask\` undoes never) |

## Project files
Open or create them from the settings page ("This project").
- \`.claude/tasks/config.json\`: this project's values, above.
- \`.claude/better-tasks/<file>\`: extends better-tasks' instruction of the same name (lead.md, teammate.md, status-check.md, done.md, testing.md, video.md, pull-request.md, contribute.md); "replace: true" in its front matter replaces it. The shipped ones are in the plugin's .claude/better-tasks/.
- \`.claude/tasks/task-template.md\`: the body a new task file starts with.
`

/** The whole SKILL.md. */
export function renderSkill(userConfig: UserConfig): string {
  return [HEAD, ...GROUPS.map(group => table(group, userConfig)), TAIL].join('\n\n').replace(/\n{3,}/g, '\n\n')
}
