import type { ToolSpec } from 'claude-code'

import type { Task, TaskStatus, TurnFacts, When } from '../types'
import { createDenial } from './coordinator'
import type { Io } from './io'
import type { Settings } from './settings'
import { readSprints, withGoal, writeSprints } from './sprintlog'
import { nextSprint, sprintLabel, sprintStart } from './sprints'
import { changeTask } from './taskflow'
import { createTask, findTask, isOpen, listTasks, taskLine, today } from './tasks'
import { blockOf, cacheText, findMate, mateLine, refreshTeam } from './team'
import { initProject } from './texts'

// The tools the model gets, listed as mcp__better-tasks__<name>.

const WHEN = { type: 'string', enum: ['now', 'this-sprint', 'next-sprint', 'backlog'] }
const STATUS = { type: 'string', enum: ['todo', 'doing', 'done', 'cancelled'] }

export const TOOLS: readonly ToolSpec[] = [
  {
    name: 'task_create',
    description:
      'Create a task file. Never starts it. Ask the user which sprint first (start now = currently working on / this sprint / ' +
      'next sprint / backlog) unless they said. when: now = currently working on.',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string' }, goal: { type: 'string' }, when: WHEN },
      required: ['title', 'goal', 'when'],
    },
  },
  {
    name: 'task_update',
    description:
      'Change a task: status, when (moves it between sprints), owner (teammate name), title, goal, a dated note. ' +
      'status "done" also logs it in docs/tasks.md (pass a summary as note, and the commits).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: STATUS,
        when: WHEN,
        owner: { type: 'string' },
        title: { type: 'string' },
        goal: { type: 'string' },
        note: { type: 'string' },
        commits: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'task_note',
    description:
      'Add a dated note to an existing task: what the user just said about it (an observation, a bug, a wish). ' +
      'Use it instead of task_create when the message refers to a task. The result names the owner to forward it to.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, note: { type: 'string' } },
      required: ['id', 'note'],
    },
  },
  {
    name: 'task_list',
    description: 'List open tasks, one line each. sprint: current (default, includes currently working on), next, backlog, or all (done too).',
    inputSchema: {
      type: 'object',
      properties: { sprint: { type: 'string', enum: ['current', 'next', 'backlog', 'all'] } },
    },
  },
  {
    name: 'sprint_goal',
    description: "Set the current sprint's one-line goal.",
    inputSchema: { type: 'object', properties: { goal: { type: 'string' } }, required: ['goal'] },
  },
  {
    name: 'project_init',
    description:
      'Write starter override files for this project in .claude/tasks/ (config.json, coordinator.md, teammate.md, ' +
      'task-template.md, tips.md). Existing files are kept. Use when the user wants to customize better-tasks here.',
  },
  {
    name: 'team_status',
    description: 'Teammates: name, status, context fill and the tasks they own. Check it before routing work.',
  },
]

export type ToolAnswer = { result: string } | { deny: string }

type Input = {
  id?: string
  title?: string
  goal?: string
  when?: When
  status?: TaskStatus
  owner?: string
  note?: string
  commits?: string
  sprint?: string
}

/** The call as the hook saw it: the tool's short name, its input, and who called. */
export type ToolRun = { name: string; input: Input; facts: TurnFacts; agentId?: string }

export async function runTool(io: Io, run: ToolRun, settings: Settings): Promise<ToolAnswer> {
  const config = settings.sprint
  const { input } = run
  if (run.name === 'task_create') {
    const denial = createDenial(run.facts, run.agentId)
    if (denial) return { deny: denial }
    const when = input.when ?? 'backlog'
    const task = await createTask(io, { title: input.title ?? '', goal: input.goal ?? '', when })
    return { result: `Created ${task.id} (${when}): ${task.file}. Not started.` }
  }
  if (run.name === 'task_update') {
    const task = await findTask(io, input.id ?? '')
    if (!task) return { deny: `No task ${input.id}.` }
    const changed = await changeTask(io, task, input, config)
    const line = taskLine(changed, await today(io), config)
    return { result: input.note ? `${line}\n${await ownerHint(io, changed, settings)}` : line }
  }
  if (run.name === 'task_note') {
    const task = await findTask(io, input.id ?? '')
    if (!task) return { deny: `No task ${input.id}. Create it with task_create, or check the id with task_list.` }
    const noted = await changeTask(io, task, { note: input.note ?? '' }, config)
    return { result: `Noted on ${noted.id} ${noted.title}.\n${await ownerHint(io, noted, settings)}` }
  }
  if (run.name === 'task_list') return { result: await taskList(io, input.sprint ?? 'current', settings) }
  if (run.name === 'sprint_goal') return { result: await setGoal(io, input.goal ?? '', settings) }
  if (run.name === 'team_status') return { result: await teamStatus(io) }
  if (run.name === 'project_init') return { result: await projectInit(io) }
  return { deny: `Unknown tool ${run.name}.` }
}

async function taskList(io: Io, which: string, settings: Settings): Promise<string> {
  const config = settings.sprint
  const day = await today(io)
  const current = sprintStart(day, config)
  const picks: Record<string, (sprint: string) => boolean> = {
    current: sprint => sprint === current,
    next: sprint => sprint === nextSprint(current, config),
    backlog: sprint => sprint === 'backlog',
  }
  const pick = picks[which] ?? (() => true)
  const tasks = (await listTasks(io)).filter(task => pick(task.sprint) && (which === 'all' || isOpen(task)))
  return tasks.length === 0 ? 'No tasks.' : tasks.map(task => taskLine(task, day, config)).join('\n')
}

async function setGoal(io: Io, goal: string, settings: Settings): Promise<string> {
  const start = sprintStart(await today(io), settings.sprint)
  const label = sprintLabel(start, settings.sprint)
  await writeSprints(io, withGoal(await readSprints(io), start, label, goal))
  return `${label} goal: ${goal}`
}

async function teamStatus(io: Io): Promise<string> {
  const team = await refreshTeam(io)
  const tasks = (await listTasks(io)).filter(isOpen)
  const lines = team.map(mate => {
    const owned = tasks.filter(task => task.owner === mate.name).map(task => task.id)
    return `${mateLine(mate)}${owned.length ? ` · ${owned.join(', ')}` : ''}`
  })
  return lines.length ? lines.join('\n') : 'No teammates.'
}

async function projectInit(io: Io): Promise<string> {
  const written = await initProject(io)
  const list = written.length ? `Wrote ${written.join(', ')}.` : 'All override files exist already.'
  return `${list} Edit them in .claude/tasks/; config.json keys starting with // are off.`
}

/** Who should hear about a note on `task`, and how. */
async function ownerHint(io: Io, task: Task, settings: Settings): Promise<string> {
  if (!task.owner) return 'No owner yet: nobody to tell.'
  const mate = findMate(await refreshTeam(io), task.owner)
  if (!mate) return `Owner ${task.owner} is not running: tell it with SendMessage (it resumes) or route the task anew.`
  const block = blockOf(mate, settings.contextLimit)
  if (block) {
    const why = block === 'cold' ? 'its cache is cold' : `it is over ${settings.contextLimit} % context`
    return `Owner ${mate.name} takes no new work (${why}): give the note to a fresh teammate for the area, with the task file and ${mate.name}'s transcript.`
  }
  const facts = [cacheText(mate), mate.percent === undefined ? undefined : `${mate.percent} %`].filter(Boolean).join(', ')
  return `Owner ${mate.name}${facts ? ` (${facts})` : ''}: forward the note with SendMessage.`
}
