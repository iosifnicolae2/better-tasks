import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, ToolCallInput } from 'claude-code'

import type { Activity, Task, Teammate, TurnFacts } from '../types'
import { activityOf } from './activity'
import { rollOver } from './boundary'
import { contextBlock, footerText, isPerson, namesTime, withRules } from './coordinator'
import type { Io } from './io'
import { PANE_COMMANDS, registerPane } from './pane'
import { registerScreen, SCREEN_COMMANDS, SCREEN_TOOLS } from './screen'
import { RESTART_TEXT, SETUP_PROMPT, teamsState, waitingLine } from './setup'
import { projectSettings, readOverrides } from './settings'
import type { Settings } from './settings'
import { sprintStart } from './sprints'
import { listTasks, today } from './tasks'
import { contextTokens, refreshTeam, sendDenial } from './team'
import { projectText } from './texts'
import { startupTips } from './tips'
import { runTool, TOOLS } from './tools'

// Wires the parts to the engine. `$` and the state refs stay in this file (the
// validator follows neither across an import); the parts get `ioOf($)`.
// Settings are read per call (settingsNow): the plugin's options with the project's config.json over them.

let pluginOptions: PluginOptions = {}
let loggedProblems = ''

const tasksState = atom({ plugin: 'supermanager', key: 'tasks' } as const, [] as Task[])
const teamState = atom({ plugin: 'supermanager', key: 'team' } as const, [] as Teammate[])
const tokensState = atom({ plugin: 'supermanager', key: 'tokens' } as const, {} as Record<string, number>)
const activityState = atom({ plugin: 'supermanager', key: 'activity' } as const, {} as Record<string, Activity>)
const noticeState = atom({ plugin: 'supermanager', key: 'notice' } as const, '')
const footerState = atom({ plugin: 'supermanager', key: 'footer' } as const, '')
const turnState = atom({ plugin: 'supermanager', key: 'turn' } as const, { asked: false, namedTime: false } as TurnFacts)

export const register: Register = (on, options) => {
  pluginOptions = options
  registerPane(on, options)
  registerScreen(on, options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await declareAll($)
    if (!(await setUpTeams($))) return started
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
    await update($, turnState, () => ({ asked: false, namedTime: namesTime(e.text) }))
    const settings = await settingsNow($)
    const block = await contextBlock(ioOf($), settings, await read($, noticeState))
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
    const teammate = await projectText(ioOf($), 'teammate')
    const prompt = teammate ? `${e.prompt}\n\n${teammate}` : e.prompt
    const isWorktree = (await settingsNow($)).worktree && !e.isolation
    return next({ ...e, prompt, ...(isWorktree ? { isolation: 'worktree' as const } : {}) })
  })

  on('tool.call', { tool: 'SendMessage' }, async ($, e, next) => {
    if (!(await teamsOn($))) return next(e)
    const team = await refreshTeam(ioOf($))
    const denial = sendDenial(team, String(e.to), e.message, (await settingsNow($)).contextLimit)
    return denial ? { deny: denial } : next(e)
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
      await update($, tokensState, all => ({ ...all, [agentId]: tokens }))
      await refreshTeam(ioOf($))
    }
    return result
  })

  on('tool.call', { tool: 'mcp__supermanager__task_create' }, ($, e) => serveTool($, e, 'task_create'))
  on('tool.call', { tool: 'mcp__supermanager__task_update' }, ($, e) => serveTool($, e, 'task_update'))
  on('tool.call', { tool: 'mcp__supermanager__task_list' }, ($, e) => serveTool($, e, 'task_list'))
  on('tool.call', { tool: 'mcp__supermanager__sprint_goal' }, ($, e) => serveTool($, e, 'sprint_goal'))
  on('tool.call', { tool: 'mcp__supermanager__team_status' }, ($, e) => serveTool($, e, 'team_status'))
  on('tool.call', { tool: 'mcp__supermanager__project_init' }, ($, e) => serveTool($, e, 'project_init'))
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
  $.ui.log(`supermanager: ${what} failed: ${reason}`)
}

async function teamsOn($: EngineInterface): Promise<boolean> {
  return (await $.env.get('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS')) === '1'
}

/** Once per session: true when agent teams are on; else asks Claude to set them up, or says to restart. */
async function setUpTeams($: EngineInterface): Promise<boolean> {
  const state = teamsState(await $.env.get('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'), (await $.settings.read()).env)
  if (state === 'restart') {
    $.ui.toast(RESTART_TEXT)
    $.ui.status(RESTART_TEXT)
  }
  if (state === 'missing') {
    $.ui.status('supermanager: agent teams are off')
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
  if (text) $.ui.log(`supermanager: config.json: ${text}. Using the other settings.`)
}

async function serveTool($: EngineInterface, e: ToolCallInput, name: string) {
  const facts = await read($, turnState)
  return runTool(ioOf($), { name, input: e as never, facts, agentId: e.agentId }, await settingsNow($))
}

/** Sprint progress in the footer; the status line stays free for what needs attention. */
async function showStatus($: EngineInterface, settings: Settings): Promise<void> {
  const start = sprintStart(await today(ioOf($)), settings.sprint)
  const tasks = await read($, tasksState)
  await update($, footerState, () => footerText(tasks, start))
}

/** Once a minute: a new sprint? then fresh tasks, team and status line. */
async function tick($: EngineInterface): Promise<void> {
  const settings = await settingsNow($)
  await logConfigProblems($)
  await checkSprint($, settings)
  await listTasks(ioOf($))
  await refreshTeam(ioOf($))
  await showStatus($, settings)
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
