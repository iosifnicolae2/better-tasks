// Writes docs/instructions.md: every instruction text better-tasks puts in front of the model, each headed
// with where it comes from and when it loads. The hook texts come from running the hooks on a fake engine
// (scripts/instructions/dump.tsx, run by `claude plugin test` in a scratch copy), the rest from the files.
// Run: `bun scripts/instructions-doc.ts` writes it; `--check` exits 1 when it is stale; `--open` opens it after.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const root = new URL('..', import.meta.url).pathname
const docPath = `${root}docs/instructions.md`
const MARK = '@@better-tasks-instructions@@'

/** The settings the hooks run with: the defaults, before/after videos on, this repo's own config.json. */
const OPTIONS = { demoVideos: true }
const CONFIG = JSON.parse(readFileSync(`${root}.claude/tasks/config.json`, 'utf8'))

type Dump = {
  tools: { name: string; description: string; inputSchema?: unknown }[]
  commands: { name: string; description?: string }[]
  agents: { name: string; description: string; prompt: string; model?: string; effort?: string | number }[]
  pluginPrompts: string[]
  leadSections: { id: string; text: string }[]
  teammate: string
  context: string[]
  skills: Record<string, string>
}

type Skill = { name: string; description: string; body: string }

function readSkills(): Skill[] {
  return readdirSync(`${root}skills`).sort().map(name => {
    const text = readFileSync(`${root}skills/${name}/SKILL.md`, 'utf8')
    const [, front = '', body = text] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) ?? []
    return { name, description: front.match(/^description: (.*)$/m)?.[1] ?? '', body: body.trim() }
  })
}

/** Runs the dump on a scratch copy of the plugin: its hooks, types and the dump test with its inputs. */
function runHooks(skills: Skill[]): Dump {
  const scratch = mkdtempSync(`${tmpdir()}/better-tasks-instructions-`)
  try {
    for (const dir of ['hooks', '.claude-plugin', 'templates']) cpSync(`${root}${dir}`, `${scratch}/${dir}`, { recursive: true })
    cpSync(`${root}scripts/instructions/dump.tsx`, `${scratch}/tests/dump.test.tsx`)
    const texts = Object.fromEntries(skills.map(skill => [skill.name, skill.body]))
    writeFileSync(`${scratch}/tests/inputs.ts`, `export const OPTIONS = ${JSON.stringify(OPTIONS)}\nexport const CONFIG = ${JSON.stringify(CONFIG)}\nexport const SKILLS: Record<string, string> = ${JSON.stringify(texts)}\n`)
    const run = spawnSync('claude', ['plugin', 'test', scratch], { encoding: 'utf8' })
    const line = `${run.stdout}\n${run.stderr}`.split('\n').find(text => text.startsWith(MARK))
    if (!line) throw new Error(`the dump printed nothing:\n${run.stdout}\n${run.stderr}`)
    return JSON.parse(line.slice(MARK.length).replaceAll(scratch, '${CLAUDE_PLUGIN_ROOT}'))
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/** A part of the file: its title, where it comes from, when it loads, and the text as the model gets it. */
function part(title: string, source: string, loads: string, text: string): string {
  return `## Part: ${title}\n- Source: ${source}\n- Loads: ${loads}\n\n${fenced(text)}`
}

/** The text in a fence longer than any backtick run inside it, so it shows as written. */
function fenced(text: string, lang = 'markdown'): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map(run => run.length))
  const fence = '`'.repeat(longest + 1)
  return `${fence}${lang}\n${text.trim()}\n${fence}`
}

function render(dump: Dump, skills: Skill[]): string {
  const lead = dump.leadSections.map(section => section.text).join('\n\n')
  const parts = [
    part("The lead's rules", 'hooks/register.tsx `prompt.compose` (texts.ts, models.ts, testenv.ts, gitflow.ts, pullrequest.ts, instructions.ts, contribute.ts)', 'always, in the main session: added to its system prompt on every turn', lead),
    part("A teammate's prompt", 'hooks/register.tsx `tool.call` Agent (the task\'s summary, texts.ts, models.ts, testenv.ts, demovideo.ts, gitflow.ts, instructions.ts)', 'teammate only: appended to the prompt of every named teammate the lead spawns (here: "login", task T-004)', dump.teammate),
    part('The context on each user message', 'hooks/register.tsx `prompt.submit` (texts.ts contextBlock)', 'lead only: added to every message the user sends', dump.context.join('\n\n')),
    ...dump.pluginPrompts.map(text => part('The CLAUDE.md pointer', 'hooks/register.tsx pointUserRules (texts.ts pointerPrompt)', 'once per user: sent as a prompt when ~/.claude/CLAUDE.md has no better-tasks section yet', text)),
    ...dump.agents.map(agent => part(`Agent type ${agent.name}`, 'hooks/models.ts teammateTypes, registered by register.tsx', `when the lead spawns a teammate of this type (model ${agent.model ?? 'inherit'}, effort ${agent.effort ?? 'default'}). Description: ${agent.description}`, agent.prompt)),
    ...skills.map(skill => part(`Skill ${skill.name}`, `skills/${skill.name}/SKILL.md, its "Settings" filled in by register.tsx \`skill.prompt\``, `on skill load (its description is always in the skill list): ${skill.description}`, dump.skills[skill.name] ?? skill.body)),
    part('PR template', 'templates/pull_request_template.md', "when a teammate writes a PR's description and the project has no template of its own (the pull-request skill)", readFileSync(`${root}templates/pull_request_template.md`, 'utf8')),
    part('Tools', 'hooks/tools.ts TOOLS, hooks/screen.ts, hooks/contribute.ts; registered at session start', 'always: each name and description is in the tool list (MCP server "better-tasks")', dump.tools.map(tool => `### ${tool.name}\n${tool.description}\n\nInput: ${JSON.stringify(tool.inputSchema ?? {})}`).join('\n\n')),
    part('Commands', 'hooks/pane.tsx, hooks/screen.ts; registered at session start', 'always: shown in the slash menu', dump.commands.map(command => `/${command.name}: ${command.description ?? ''}`).join('\n')),
  ]
  const contents = parts.map(text => `- ${text.split('\n')[0]!.slice('## Part: '.length)}`).join('\n')
  return `# Every instruction better-tasks loads
Generated by \`bun scripts/instructions-doc.ts\`: each text better-tasks puts in front of the model, with where it comes from and when it loads. Open it to read or review what the lead and the teammates are told.

Rendered with the plugin's defaults, before/after videos on, and this repo's \`.claude/tasks/config.json\` (${JSON.stringify(CONFIG)}); other settings change some lines (the git flow, off-screen, videos). Find a part: grep \`^## Part:\`; the parts' own headings sit inside their code blocks.

${contents}

${parts.join('\n\n')}
`
}

const skills = readSkills()
const text = render(runHooks(skills), skills)
if (process.argv.includes('--check')) {
  const isCurrent = readFileSync(docPath, 'utf8') === text
  console.log(isCurrent ? 'instructions-doc: docs/instructions.md is current' : 'instructions-doc: docs/instructions.md is stale; run `bun scripts/instructions-doc.ts`')
  process.exit(isCurrent ? 0 : 1)
}
writeFileSync(docPath, text)
console.log(`instructions-doc: wrote ${docPath}`)
if (process.argv.includes('--open')) spawnSync('open', [docPath])
