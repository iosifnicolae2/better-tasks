import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, ToolCallInput } from 'claude-code'

import type { Activity, CacheStep, Task, Teammate, TurnFacts } from '../types'
import { activityOf } from './activity'
import { realigned, rollOver } from './boundary'
import { subagentTtl } from './cache'
import { migrateFolder } from './migrate'
import { contextBlock, footerText, isPerson, isQuestion, unfiledLine, withRules } from './coordinator'
import type { Io } from './io'
import { PANE_COMMANDS, registerPane } from './pane'
import { registerScreen, SCREEN_COMMANDS, SCREEN_TOOLS } from './screen'
import { hasPointer, pointerPrompt, RESTART_TEXT, SETUP_PROMPT, teamsState, waitingLine } from './setup'
import { projectSettings, readOverrides } from './settings'
import type { Settings } from './settings'
import { sprintStart } from './sprints'
import { listTasks, saveTask, today } from './tasks'
import { blockAdvice, contextTokens, refreshTeam, sendBlock } from './team'
import { projectText } from './texts'
import { spawnTask, withSummary } from './spawn'
import { startupTips } from './tips'
import { runTool, TOOLS } from './tools'

// Wires the parts to the engine. `$` and the state refs stay in this file (the
// validator follows neither across an import); the parts get `ioOf($)`.
// Settings are read per call (settingsNow): the plugin's options with the project's config.json over them.

/** The tools that file a user's message: as a new task, or on an existing one. */
const FILING_TOOLS = ['task_create', 'task_update', 'task_note']

let pluginOptions: PluginOptions = {}
let loggedProblems = ''

const tasksState = atom({ plugin: 'better-tasks', key: 'tasks' } as const, [] as Task[])
const teamState = atom({ plugin: 'better-tasks', key: 'team' } as const, [] as Teammate[])
const tokensState = atom({ plugin: 'better-tasks', key: 'tokens' } as const, {} as Record<string, number>)
const activityState = atom({ plugin: 'better-tasks', key: 'activity' } as const, {} as Record<string, Activity>)
const cacheStepsState = atom({ plugin: 'better-tasks', key: 'cacheSteps' } as const, {} as Record<string, CacheStep>)
const noticeState = atom({ plugin: 'better-tasks', key: 'notice' } as const, '')
const footerState = atom({ plugin: 'better-tasks', key: 'footer' } as const, '')
const turnState = atom({ plugin: 'better-tasks', key: 'turn' } as const, { asked: false, filed: false, question: false, prompted: false } as TurnFacts)

export const register: Register = (on, options) => {
  pluginOptions = options
  registerPane(on, options)
  registerScreen(on, options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await declareAll($)
    await useLongCache($).catch(error => logFailure($, 'the 1-hour cache', error))
    const moved = await migrateFolder(ioOf($)).catch(error => `better-tasks: moving the old task folder failed: ${error}`)
    if (moved) $.ui.log(moved)
    if (!(await setUpTeams($))) return started
    if (e.isInteractive) await pointUserRules($).catch(error => logFailure($, 'the CLAUDE.md pointer', error))
    await tick($).catch(error => logFailure($, 'the first refresh', error))
    $.clock.every(60_000, () => tick($))
    const tips = await startupTips(ioOf($), await settingsNow($)).catch(() => [])
    for (const line of tips) $.ui.log(line)
    return started
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const footer = await read($, footerState)
    return footer ? next({ ...e, props: { ...e.props, modes: [...e.props.modes, footer] } }) : next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!(await teamsOn($))) return composed
    return { sections: withRules(composed.sections, e.traits, e.tools, await projectText(ioOf($), 'coordinator')) }
  })

  on('prompt.submit', async ($, e, next) => {
    if (!isPerson(e.origin)) return next(e)
    const state = teamsState(await $.env.get('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'), (await $.settings.read()).env)
    if (state !== 'on') return next({ ...e, context: [...(e.context ?? []), waitingLine(state)] })
    const reminder = unfiledLine(await read($, turnState))
    await update($, turnState, () => ({ asked: false, filed: false, question: isQuestion(e.text), prompted: true }))
    const settings = await settingsNow($)
    const notices = [await read($, noticeState), reminder].filter(Boolean).join('\n')
    const block = await contextBlock(ioOf($), settings, notices)
    await update($, noticeState, () => '')
    await showStatus($, settings)
    return next({ ...e, context: [...(e.context ?? []), block] })
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const answered = await next(e)
    if (e.agentId === undefined) await update($, turnState, facts => ({ ...facts, asked: true }))
    return answered
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (!e.name || !(await teamsOn($))) return next(e)
    const settings = await settingsNow($)
    const task = spawnTask(await listTasks(ioOf($)), e.prompt, e.name, settings.tasks.prefix)
    const named = task ? withSummary(e, task) : { description: e.description, prompt: e.prompt }
    const teammate = await projectText(ioOf($), 'teammate')
    const prompt = teammate ? `${named.prompt}\n\n${teammate}` : named.prompt
    const isWorktree = settings.worktree && !e.isolation
    return next({ ...e, description: named.description, prompt, ...(isWorktree ? { isolation: 'worktree' as const } : {}) })
  })

  on('tool.call', { tool: 'SendMessage' }, async ($, e, next) => {
    if (!(await teamsOn($))) return next(e)
    const team = await refreshTeam(ioOf($))
    const limit = (await settingsNow($)).contextLimit
    const blocked = sendBlock(team, String(e.to), e.message, limit)
    if (!blocked) return next(e)
    return { deny: blockAdvice(blocked.mate, blocked.block, limit, await transcriptOf($, blocked.mate.id)) }
  })

  on('tool.call', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId !== undefined) {
      const now = await $.clock.now()
      const text = activityOf(String(e.tool), e)
      await update($, activityState, all => ({ ...all, [agentId]: { text, at: now } }))
      await refreshTeam(ioOf($))
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId !== undefined) {
      await update($, activityState, ({ [agentId]: _ended, ...rest }) => rest)
      await refreshTeam(ioOf($))
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const agentId = e.agentId
    if (agentId !== undefined && result.usage) {
      const tokens = contextTokens(result.usage)
      const step = { at: await $.clock.now(), read: result.usage.cache_read_input_tokens, created: result.usage.cache_creation_input_tokens }
      await update($, tokensState, all => ({ ...all, [agentId]: tokens }))
      await update($, cacheStepsState, all => ({ ...all, [agentId]: step }))
      await refreshTeam(ioOf($))
    }
    return result
  })

  on('tool.call', { tool: 'mcp__better-tasks__task_create' }, ($, e) => serveTool($, e, 'task_create'))
  on('tool.call', { tool: 'mcp__better-tasks__task_update' }, ($, e) => serveTool($, e, 'task_update'))
  on('tool.call', { tool: 'mcp__better-tasks__task_list' }, ($, e) => serveTool($, e, 'task_list'))
  on('tool.call', { tool: 'mcp__better-tasks__sprint_goal' }, ($, e) => serveTool($, e, 'sprint_goal'))
  on('tool.call', { tool: 'mcp__better-tasks__team_status' }, ($, e) => serveTool($, e, 'team_status'))
  on('tool.call', { tool: 'mcp__better-tasks__project_init' }, ($, e) => serveTool($, e, 'project_init'))
  on('tool.call', { tool: 'mcp__better-tasks__task_note' }, ($, e) => serveTool($, e, 'task_note'))
  on('tool.call', { tool: 'mcp__better-tasks__task_search' }, ($, e) => serveTool($, e, 'task_search'))
}

/** Registers every tool and command on its own: one refusal (a taken name) leaves the rest working. */
async function declareAll($: EngineInterface): Promise<void> {
  for (const tool of [...TOOLS, ...SCREEN_TOOLS]) {
    await $.tool.register(tool).catch(error => logFailure($, `tool ${tool.name}`, error))
  }
  for (const command of [...PANE_COMMANDS, ...SCREEN_COMMANDS]) {
    await $.command.register(command).catch(error => logFailure($, `/${command.name}`, error))
  }
}

function logFailure($: EngineInterface, what: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error)
  $.ui.log(`better-tasks: ${what} failed: ${reason}`)
}

/**
 * The 1-hour prompt cache for teammates and the main conversation (setting `longCache`), unless the user
 * chose a TTL already. Set in this process's environment, which Claude Code reads per request.
 */
async function useLongCache($: EngineInterface): Promise<void> {
  if (!(await settingsNow($)).longCache) return
  const chosen = await $.settings.read()
  if ((await $.env.get('CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL')) === undefined && chosen.subagentPromptCacheTtl === undefined) {
    await $.env.set('CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL', '1h')
  }
  if ((await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL')) === undefined && chosen.promptCacheTtl === undefined) {
    await $.env.set('CLAUDE_CODE_PROMPT_CACHE_TTL', '1h')
  }
}

/** Where a teammate's transcript is: ~/.claude/projects/<project>/<session>/subagents/, the file named for its id. */
async function transcriptOf($: EngineInterface, agentId: string): Promise<string> {
  const home = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${(await $.env.get('HOME')) ?? '~'}/.claude`
  const project = (await $.session.root()).replace(/[^A-Za-z0-9]/g, '-')
  const folder = `${home}/projects/${project}/${await $.session.id()}/subagents`
  const files = await $.fs.list(folder).catch(() => [])
  const file = files.find(entry => entry.name.includes(agentId) && entry.name.endsWith('.jsonl'))
  return file ? `${folder}/${file.name}` : `${folder}/ (the .jsonl file whose name holds ${agentId})`
}

async function teamsOn($: EngineInterface): Promise<boolean> {
  return (await $.env.get('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS')) === '1'
}

/** Once per session: true when agent teams are on; else asks Claude to set them up, or says to restart. */
/** Once per machine: ask Claude to point the user's global CLAUDE.md at our team rules (the user approves the edit). */
async function pointUserRules($: EngineInterface): Promise<void> {
  if (await $.store.get('claudeMdAsked')) return
  const home = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${(await $.env.get('HOME')) ?? '~'}/.claude`
  const path = `${home}/CLAUDE.md`
  const text = await $.fs.read(path).catch(() => undefined)
  if (text !== undefined && hasPointer(text)) return
  await $.store.set('claudeMdAsked', true)
  void $.prompt.submit({ text: pointerPrompt(path, text !== undefined) }).catch(() => undefined)
}

async function setUpTeams($: EngineInterface): Promise<boolean> {
  const state = teamsState(await $.env.get('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'), (await $.settings.read()).env)
  if (state === 'restart') {
    $.ui.toast(RESTART_TEXT)
    $.ui.status(RESTART_TEXT)
  }
  if (state === 'missing') {
    $.ui.status('better-tasks: agent teams are off')
    void $.prompt.submit({ text: SETUP_PROMPT })
  }
  return state === 'on'
}

function ioOf($: EngineInterface): Io {
  const io: Io = {
    root: () => $.session.root(),
    now: () => $.clock.now(),
    sessionId: () => $.session.id(),
    read: path => $.fs.read(path),
    write: (path, text) => $.fs.write(path, text),
    list: path => $.fs.list(path),
    publishTasks: tasks => update($, tasksState, () => tasks),
    agents: () => $.agent.list(),
    window: async () => (await $.session.usage()).context.window,
    tokens: () => read($, tokensState),
    activities: () => read($, activityState),
    publishTeam: team => update($, teamState, () => team),
    cacheSteps: () => read($, cacheStepsState),
    cacheTtl: async () =>
      subagentTtl({
        subagentEnv: await $.env.get('CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL'),
        subagentSetting: (await $.settings.read().catch(() => ({}) as Record<string, unknown>)).subagentPromptCacheTtl,
        oneHourEnv: await $.env.get('ENABLE_PROMPT_CACHING_1H'),
        force5mEnv: await $.env.get('FORCE_PROMPT_CACHING_5M'),
      }),
    run: argv => $.process.run(argv),
    config: () => projectSettings(io, pluginOptions),
  }
  return io
}

function settingsNow($: EngineInterface): Promise<Settings> {
  return projectSettings(ioOf($), pluginOptions)
}

/** One dim line when the project's config.json has problems (each bad key is skipped, the rest still applies). */
async function logConfigProblems($: EngineInterface): Promise<void> {
  const { problems } = await readOverrides(ioOf($))
  const text = problems.join('; ')
  if (text === loggedProblems) return
  loggedProblems = text
  if (text) $.ui.log(`better-tasks: config.json: ${text}. Using the other settings.`)
}

async function serveTool($: EngineInterface, e: ToolCallInput, name: string) {
  const facts = await read($, turnState)
  const answer = await runTool(ioOf($), { name, input: e as never, facts, agentId: e.agentId }, await settingsNow($))
  const isFiling = FILING_TOOLS.includes(name) && e.agentId === undefined && !('deny' in answer)
  if (isFiling) await update($, turnState, turn => ({ ...turn, filed: true }))
  return answer
}

/** Sprint progress in the footer; the status line stays free for what needs attention. */
async function showStatus($: EngineInterface, settings: Settings): Promise<void> {
  const start = sprintStart(await today(ioOf($)), settings.sprint)
  const tasks = await read($, tasksState)
  await update($, footerState, () => footerText(tasks, start, settings.sprint))
}

/** Once a minute: a new sprint? then fresh tasks, team and status line. */
async function tick($: EngineInterface): Promise<void> {
  const settings = await settingsNow($)
  await logConfigProblems($)
  await checkSprint($, settings)
  await realign($, settings)
  await refreshTeam(ioOf($))
  await showStatus($, settings)
}

/** Keeps every task on a sprint boundary when the sprint length or start day changes. */
async function realign($: EngineInterface, settings: Settings): Promise<void> {
  const current = sprintStart(await today(ioOf($)), settings.sprint)
  const tasks = await listTasks(ioOf($))
  for (const task of realigned(tasks, current, settings.sprint)) await saveTask(ioOf($), task)
}

async function checkSprint($: EngineInterface, settings: Settings): Promise<void> {
  const key = `sprint:${await $.session.root()}`
  const current = sprintStart(await today(ioOf($)), settings.sprint)
  const seen = (await $.store.get(key)) as string | undefined
  if (seen !== undefined && seen < current) {
    const rolled = await rollOver(ioOf($), seen, current, settings.sprint)
    $.ui.toast(rolled.toast)
    await update($, noticeState, () => rolled.notice)
  }
  if (seen !== current) await $.store.set(key, current)
}
