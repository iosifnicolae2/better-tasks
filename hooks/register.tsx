import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallInput } from 'claude-code'

import type { Task, Teammate, TurnFacts } from '../types'
import { rollOver } from './boundary'
import { contextBlock, isPerson, namesTime, statusText, withRules } from './coordinator'
import type { Io } from './io'
import { PANE_COMMANDS, registerPane } from './pane'
import { registerScreen, SCREEN_COMMANDS, SCREEN_TOOLS } from './screen'
import { settingsOf } from './settings'
import type { Settings } from './settings'
import { sprintStart } from './sprints'
import { listTasks, today } from './tasks'
import { contextTokens, refreshTeam, sendDenial } from './team'
import { runTool, TOOLS } from './tools'

// Wires the parts to the engine. `$` and the state refs stay in this file (the
// validator follows neither across an import); the parts get `ioOf($)`.

const tasksState = atom({ plugin: 'supermanager', key: 'tasks' } as const, [] as Task[])
const teamState = atom({ plugin: 'supermanager', key: 'team' } as const, [] as Teammate[])
const tokensState = atom({ plugin: 'supermanager', key: 'tokens' } as const, {} as Record<string, number>)
const noticeState = atom({ plugin: 'supermanager', key: 'notice' } as const, '')
const turnState = atom({ plugin: 'supermanager', key: 'turn' } as const, { asked: false, namedTime: false } as TurnFacts)

export const register: Register = (on, options) => {
  const settings = settingsOf(options)
  registerPane(on, options)
  registerScreen(on, options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    for (const tool of [...TOOLS, ...SCREEN_TOOLS]) await $.tool.register(tool)
    for (const command of [...PANE_COMMANDS, ...SCREEN_COMMANDS]) await $.command.register(command)
    await tick($, settings)
    $.clock.every(60_000, () => tick($, settings))
    return started
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    return { sections: withRules(composed.sections, e.traits, e.tools) }
  })

  on('prompt.submit', async ($, e, next) => {
    if (!isPerson(e.origin)) return next(e)
    await update($, turnState, () => ({ asked: false, namedTime: namesTime(e.text) }))
    const block = await contextBlock(ioOf($), settings, await read($, noticeState))
    await update($, noticeState, () => '')
    await showStatus($)
    return next({ ...e, context: [...(e.context ?? []), block] })
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const answered = await next(e)
    if (e.agentId === undefined) await update($, turnState, facts => ({ ...facts, asked: true }))
    return answered
  })

  on('tool.call', { tool: 'Agent' }, ($, e, next) =>
    settings.worktree && e.name && !e.isolation ? next({ ...e, isolation: 'worktree' }) : next(e),
  )

  on('tool.call', { tool: 'SendMessage' }, async ($, e, next) => {
    const team = await refreshTeam(ioOf($))
    const denial = sendDenial(team, String(e.to), e.message, settings.contextLimit)
    return denial ? { deny: denial } : next(e)
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

  on('tool.call', { tool: 'mcp__supermanager__task_create' }, ($, e) => serveTool($, e, 'task_create', settings))
  on('tool.call', { tool: 'mcp__supermanager__task_update' }, ($, e) => serveTool($, e, 'task_update', settings))
  on('tool.call', { tool: 'mcp__supermanager__task_list' }, ($, e) => serveTool($, e, 'task_list', settings))
  on('tool.call', { tool: 'mcp__supermanager__sprint_goal' }, ($, e) => serveTool($, e, 'sprint_goal', settings))
  on('tool.call', { tool: 'mcp__supermanager__team_status' }, ($, e) => serveTool($, e, 'team_status', settings))
}

function ioOf($: EngineInterface): Io {
  return {
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
    publishTeam: team => update($, teamState, () => team),
  }
}

async function serveTool($: EngineInterface, e: ToolCallInput, name: string, settings: Settings) {
  const facts = await read($, turnState)
  return runTool(ioOf($), { name, input: e as never, facts, agentId: e.agentId }, settings)
}

async function showStatus($: EngineInterface): Promise<void> {
  $.ui.status(statusText(await read($, teamState), await read($, tasksState)))
}

/** Once a minute: a new sprint? then fresh tasks, team and status line. */
async function tick($: EngineInterface, settings: Settings): Promise<void> {
  await checkSprint($, settings)
  await listTasks(ioOf($))
  await refreshTeam(ioOf($))
  await showStatus($)
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
