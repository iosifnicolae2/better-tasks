import type { AgentInfo, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { ENABLE_OPTION, QUESTION } from '../hooks/demovideo'
import { PANE_COMMANDS } from '../hooks/pane'
import { SCREEN_COMMANDS } from '../hooks/screen'

const ROOT = '/project'
const TASKS = `${ROOT}/.claude/tasks`
const SESSION = { cwd: ROOT, surface: 'terminal', isInteractive: true } as const
const MONDAY_OCT_5 = new Date(2026, 9, 5, 9).getTime()
const SUNDAY_OCT_11_LATE = new Date(2026, 9, 11, 23, 58).getTime()
const WINDOW = 200_000

const TEAMS_ON = { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' }

type Host = {
  files: Map<string, string>
  status: string[]
  toasts: string[]
  pluginPrompts: string[]
  notices: string[]
  registered: string[]
  spawned: string[]
  descriptions: string[]
  /** Each process.spawn's argv; spawnOutput is what each one prints. */
  spawnedArgv: string[][]
  spawnOutput: string
  env: Map<string, string>
  composer: string
}
type Teams = { env: Record<string, string>; settingsEnv: Record<string, string> }

/** The engine beneath the plugin: files in memory, a session, the given agents, agent teams on unless said. */
function fakeHost(
  on: On,
  agents: AgentInfo[] = [],
  seed: Record<string, string> = {},
  teams: Teams = { env: TEAMS_ON, settingsEnv: TEAMS_ON },
  takenNames: string[] = [],
): Host {
  const host: Host = { files: new Map(Object.entries(seed)), status: [], toasts: [], pluginPrompts: [], notices: [], registered: [], spawned: [], descriptions: [], spawnedArgv: [], spawnOutput: '', env: new Map(), composer: '' }
  const env = new Map(Object.entries(teams.env))
  host.env = env
  on('env.get', ($, e) => ({ value: env.get(e.name) }))
  on('env.set', ($, e) => {
    if (e.value === undefined) env.delete(e.name)
    else env.set(e.name, e.value)
    return { value: undefined }
  })
  on('settings.read', () => ({ value: { env: teams.settingsEnv } }))
  on('prompt.read', () => ({ value: { text: host.composer, cursor: 0 } }))
  on('ui.log', ($, e) => {
    host.notices.push(e.text)
    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: ROOT }))
  on('session.id', () => ({ value: 'lead-session' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: WINDOW, percent: 10 }, rateLimits: [] } }))
  on('agent.list', () => ({ value: agents }))
  on('tool.register', ($, e) => {
    host.registered.push(e.name)
    return { value: { tool: `mcp__better-tasks__${e.name}` } }
  })
  on('command.register', ($, e) => {
    if (takenNames.includes(e.name)) return { deny: `"/${e.name}" refused: it is the built-in /${e.name}` }
    host.registered.push(`/${e.name}`)
    return { value: { command: e.name } }
  })
  on('ui.status', ($, e) => {
    host.status.push(String(e.text))
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    host.toasts.push(e.text)
    return { value: undefined }
  })
  on('fs.read', ($, e) => {
    const text = host.files.get(e.path)
    return text === undefined ? { deny: `ENOENT ${e.path}` } : { value: text }
  })
  on('fs.write', ($, e) => {
    host.files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.list', ($, e) => {
    const prefix = `${e.path}/`
    const inside = [...host.files.keys()].filter(path => path.startsWith(prefix)).map(path => path.slice(prefix.length))
    if (inside.length === 0) return { deny: `ENOENT ${e.path}` }
    const names = [...new Set(inside.map(path => path.split('/')[0] ?? path))]
    const kindOf = (name: string) => (inside.includes(name) ? ('file' as const) : ('dir' as const))
    return { value: names.map(name => ({ name, kind: kindOf(name), size: 1, mtimeMs: 0, isLink: false })) }
  })
  on('process.run', ($, e) => {
    const [command, ...args] = e.argv
    const paths = args.filter(arg => !arg.startsWith('-'))
    if (command === 'mv' && paths.length === 2) {
      const [from = '', to = ''] = paths
      for (const [path, text] of [...host.files]) {
        if (path !== from && !path.startsWith(`${from}/`)) continue
        host.files.delete(path)
        host.files.set(to + path.slice(from.length), text)
      }
    }
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: { answers: { When: 'Now' } } }))
  on('tool.call', { tool: 'SendMessage' }, () => ({ result: 'sent' }))
  on('tool.call', { tool: 'Agent' }, ($, e) => {
    host.spawned.push(e.prompt)
    host.descriptions.push(e.description)
    return { result: { isolation: e.isolation ?? 'none' } }
  })
  on('prompt.submit', ($, e) => {
    if (e.origin.kind === 'plugin') host.pluginPrompts.push(e.text)
    return { text: e.text, context: e.context }
  })
  on('process.spawn', async function* ($, e) {
    host.spawnedArgv.push([...e.argv])
    if (host.spawnOutput) yield { stream: 'stdout', text: host.spawnOutput }
    return { value: { code: 0, signal: null } }
  })
  return host
}

const mate = (id: string, name: string): AgentInfo => ({ id, name, description: name, type: 'teammate', status: 'running' })

const prompt = (text: string) => ({ text, origin: { kind: 'composer' }, wait: false }) as const
const create = { tool: 'mcp__better-tasks__task_create', tool_use_id: 't1', title: 'Fix login', goal: 'No loop', when: 'now' } as const

test('a new task starts now by default, with no question asked', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  await $.session.start(SESSION)
  await $.prompt.submit(prompt('fix the login loop'))
  const { title, goal } = create
  const made = await $.tool.call({ tool: 'mcp__better-tasks__task_create', tool_use_id: 't1', title, goal } as never)
  expect(String(made.result)).toBe(`Created T-001 (currently working on): ${TASKS}/T-001-fix-login.md. Route it now: the owner of its area, or a new teammate.`)
  expect(host.files.get(`${TASKS}/T-001-fix-login.md`)).toContain('sprint: 2026-10-05\nurgent: true\nstatus: todo')
})

test('a named sprint or the backlog plans the task: placed, not started', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  await $.session.start(SESSION)
  await $.prompt.submit(prompt('add a backlog task to clean up the logs'))
  const backlog = await $.tool.call({ ...create, when: 'backlog' })
  expect(String(backlog.result)).toContain('Created T-001 (backlog)')
  expect(String(backlog.result)).toContain('Not started: it waits in its sprint.')
  const later = await $.tool.call({ ...create, tool_use_id: 't2', title: 'Rate limit', when: 'next-sprint' })
  expect(String(later.result)).toContain('Created T-002 (next sprint)')
  expect(host.files.get(`${TASKS}/T-002-rate-limit.md`)).toContain('sprint: 2026-10-12\nurgent: false')
})

test('each user prompt carries the sprint context', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  fakeHost(on, [mate('a1', 'auth')])
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'mcp__better-tasks__sprint_goal', tool_use_id: 'g1', goal: 'Ship login' })
  const entered = await $.prompt.submit(prompt('hi'))
  expect(entered.context?.at(-1)).toContain('[better-tasks] Sprint 41 · Week 41 · Mon Oct 5 – Sun Oct 11 · 7 days left · goal: Ship login · 0/0 done')
  expect(entered.context?.at(-1)).toContain('Teammate auth · idle')
})

test('the coordinator rules go into the main session prompt only', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  fakeHost(on)
  let body = 'intro'
  on('prompt.compose', () => ({ sections: [{ id: body, text: 'You are Claude.', scope: 'shared' }] }))
  const base = { model: 'm', promptModel: 'm', surfaces: [], outputStyle: null } as const
  const MAIN_TOOLS = ['Agent', 'Read', 'SendMessage']
  const idsFor = async (sectionId: string, tools: string[], traits: ('teammate' | 'lean')[] = []) => {
    body = sectionId
    return (await $.prompt.compose({ ...base, tools, traits })).sections.map(section => section.id)
  }

  expect(await idsFor('intro', MAIN_TOOLS)).toEqual(['intro', 'better-tasks:coordinator'])
  expect(await idsFor('lean_body', MAIN_TOOLS, ['lean'])).toEqual(['lean_body', 'better-tasks:coordinator'])
  expect(await idsFor('intro', MAIN_TOOLS, ['teammate'])).toEqual(['intro'])
  expect(await idsFor('intro', ['Read', 'Grep', 'Bash'])).toEqual(['intro']) // an Explore scout: no Agent tool
  expect(await idsFor('agent_prompt', MAIN_TOOLS)).toEqual(['agent_prompt']) // a subagent's own prompt
})

test('with worktree on, a named teammate is spawned in a worktree', { options: { worktree: true } }, async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  fakeHost(on)
  await $.session.start(SESSION)
  const named = await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'p', name: 'auth' })
  expect(named.result).toEqual({ isolation: 'worktree' })
  const scout = await $.tool.call({ tool: 'Agent', tool_use_id: 'a2', description: 'd', prompt: 'p' })
  expect(scout.result).toEqual({ isolation: 'none' })
})

test('a new sprint rolls unfinished work over and writes the review', async ($, on) => {
  const clock = mock.clock(on, { now: SUNDAY_OCT_11_LATE })
  mock.store(on)
  const host = fakeHost(on)
  await $.session.start(SESSION)
  await $.prompt.submit(prompt('two tasks for this sprint'))
  await $.tool.call({ ...create, when: 'this-sprint', title: 'Open one' })
  await $.tool.call({ ...create, tool_use_id: 't2', when: 'this-sprint', title: 'Shipped one' })
  await $.tool.call({ tool: 'mcp__better-tasks__task_update', tool_use_id: 'u1', id: 'T-002', status: 'done', note: 'Works', commits: 'abc123' })
  expect(host.files.get(`${ROOT}/docs/tasks.md`)).toContain('| T-002 Shipped one | Works | abc123 | session lead-session')

  await clock.advance(3 * 60_000)
  expect(host.files.get(`${TASKS}/T-001-open-one.md`)).toContain('sprint: 2026-10-12\nurgent: false\nstatus: todo\nowner:\nrolled: 1')
  const sprints = host.files.get(`${ROOT}/.claude/tasks/sprints.md`) ?? ''
  expect(sprints).toContain('Shipped:\n- T-002 Shipped one\nRolled over:\n- T-001 Open one')
  expect(host.toasts.at(-1)).toContain('Sprint 42 · Week 42 · Mon Oct 12 – Sun Oct 18 started')
  const entered = await $.prompt.submit(prompt('morning'))
  expect(entered.context?.at(-1)).toContain('Ask the user for its goal')
})

const COMPOSE_BASE = { model: 'm', promptModel: 'm', surfaces: [], tools: ['Agent'], outputStyle: null, traits: [] } as const

test('agent teams on: no setup prompt, no restart toast', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  await $.session.start(SESSION)
  await clock.advance(0)
  expect(host.pluginPrompts.filter(text => text.includes('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'))).toEqual([])
  expect(host.toasts).toEqual([])
})

test('agent teams missing everywhere: one prompt asks Claude to set them up; the mod stays off', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [mate('a1', 'auth')], {}, { env: {}, settingsEnv: {} })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))
  await $.session.start(SESSION)
  await clock.advance(0)
  expect(host.pluginPrompts).toHaveLength(1)
  expect(host.pluginPrompts[0]).toContain('"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"')
  expect(host.pluginPrompts[0]).toContain('~/.claude/settings.json')
  expect(host.pluginPrompts[0]).toContain('restart the session')
  expect([...host.files.keys()]).toEqual([])

  const composed = await $.prompt.compose(COMPOSE_BASE)
  expect(composed.sections.map(section => section.id)).toEqual(['intro'])
  const entered = await $.prompt.submit(prompt('hi'))
  expect(entered.context).toEqual(['[better-tasks] off: agent teams are not set up (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1).'])
})

test('agent teams in settings but not in this session: toast and status, no prompt', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [], {}, { env: {}, settingsEnv: TEAMS_ON })
  await $.session.start(SESSION)
  await clock.advance(0)
  expect(host.pluginPrompts).toEqual([])
  expect(host.toasts).toEqual(['Agent teams set: restart the session to turn them on'])
  expect(host.status.at(-1)).toBe('Agent teams set: restart the session to turn them on')
})

test('every session start shows the tips once, with the live sprint line', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const seed = {
    [`${ROOT}/.claude/tasks/sprints.md`]: '# Sprints\n\n## 2026-10-05 · Sprint 41 · Oct 5–11\nGoal: Ship login\n',
    [`${TASKS}/T-001-a.md`]: '---\nid: T-001\ntitle: A\nsprint: 2026-10-05\nstatus: todo\n---\n',
    [`${TASKS}/T-002-b.md`]: '---\nid: T-002\ntitle: B\nsprint: 2026-10-05\nstatus: done\n---\n',
    [`${TASKS}/T-003-c.md`]: '---\nid: T-003\ntitle: C\nsprint: backlog\nstatus: todo\n---\n',
  }
  const host = fakeHost(on, [], seed)
  await $.session.start(SESSION)
  await clock.advance(0)
  expect(host.notices).toEqual([
    'better-tasks · Sprint 41 · Week 41 · Mon Oct 5 – Sun Oct 11 · 7 days left · goal: Ship login · 1 open',
    '/better-tasks: the board · ↑↓: select  ⏎: actions  f: search  c: settings',
    '"fix the login redirect": a task, started now · "… next sprint" or "… backlog": planned, not started',
    '/away: screens off, Mac keeps working',
  ])
})

test('without agent teams the setup prompt comes first and no tips are shown', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [], {}, { env: {}, settingsEnv: {} })
  await $.session.start(SESSION)
  await clock.advance(0)
  expect(host.notices).toEqual([])
  expect(host.pluginPrompts).toHaveLength(1)
})

test('sprint progress goes in the footer; no teammate count anywhere the user sees', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [mate('a1', 'auth')])
  const drawn: string[][] = []
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    drawn.push([...e.props.modes])
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.modes.join(' & ')}</Text>
  })
  await $.session.start(SESSION)
  await $.prompt.submit(prompt('add this now: fix the login loop'))
  await $.tool.call(create)
  await $.prompt.submit(prompt('ok'))

  const footer = await $.ui.mount({ plugin: 'better-tasks', surface: 'terminal', component: 'SessionMode', props: { modes: ['focus'] } })
  expect(drawn.at(-1)).toEqual(['focus', 'Sprint 41 · 0/1 done · 1 due'])
  await footer.unmount()
  expect(host.status.join('\n')).not.toMatch(/teammate/i)
  expect(host.toasts.join('\n')).not.toMatch(/teammate/i)
})

test('a refused command name is logged; the other commands, the tools and the tips still come', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const first = PANE_COMMANDS[0]?.name ?? ''
  const host = fakeHost(on, [], {}, undefined, [first])
  await $.session.start(SESSION)
  await clock.advance(0)
  expect(host.registered).toEqual(expect.arrayContaining(['task_create', 'team_status', 'screen_off']))
  expect(host.registered).not.toContain(`/${first}`)
  expect(host.registered).toEqual(expect.arrayContaining(SCREEN_COMMANDS.map(command => `/${command.name}`)))
  expect(host.notices.some(line => line.startsWith(`better-tasks: /${first} failed:`))).toBe(true)
  expect(host.notices.some(line => line.startsWith('better-tasks · Sprint 41'))).toBe(true)
})

// Claude Code 2.1.288's built-in commands and bundled skills. The test kit refuses no name, so this list stands in.
const BUILT_IN = [
  'add-dir', 'agents', 'artifacts', 'bashes', 'bug', 'cd', 'clear', 'code-review', 'compact', 'config', 'context',
  'cost', 'doctor', 'exit', 'export', 'fast', 'focus', 'goal', 'help', 'hooks', 'ide', 'init', 'install-github-app', 'keybindings-help',
  'login', 'logout', 'loop', 'mcp', 'memory', 'model', 'output-style', 'permissions', 'plugin', 'plugins',
  'plan', 'pr-comments', 'privacy-settings', 'release-notes', 'resume', 'review', 'rewind', 'run', 'sandbox',
  'schedule', 'security-review', 'session', 'simplify', 'skills', 'status', 'statusline', 'stop', 'tasks',
  'terminal-setup', 'theme', 'todos', 'ultrareview', 'update-config', 'upgrade', 'usage', 'vim', 'loops', 'workflows',
]

test('no command of ours takes a built-in name', () => {
  const ours = [...PANE_COMMANDS, ...SCREEN_COMMANDS].map(command => command.name)
  expect(ours).toEqual(['better-tasks', 'away'])
  expect(ours.filter(name => BUILT_IN.includes(name))).toEqual([])
})

test("a teammate's tool call shows as its activity until its turn ends", async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  fakeHost(on, [mate('a1', 'auth')])
  on('tool.call', { tool: 'Edit' }, () => ({ result: 'edited' }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  await $.session.start(SESSION)
  const status = async () => String((await $.tool.call({ tool: 'mcp__better-tasks__team_status', tool_use_id: 'ts' })).result)

  const teammateEdit = { tool: 'Edit', tool_use_id: 'e1', agentId: 'a1', file_path: '/p/src/auth.ts', old_string: 'a', new_string: 'b' }
  await $.tool.call(teammateEdit as never) // agentId: as the engine raises a teammate's call
  expect(await status()).toBe('auth · working · context ? · editing auth.ts')

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'a1', reason: 'answer' })
  expect(await status()).toBe('auth · idle · context ?')
})

test('a project customizes numbering, files, the task template and teammate instructions', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const seed = {
    [`${ROOT}/.claude/tasks/config.json`]: JSON.stringify({ taskPrefix: 'BUG-', taskPadding: 2, taskFileName: '{id}.md', tasksFolder: 'work' }),
    [`${ROOT}/.claude/tasks/task-template.md`]: '# {id} {title}\n{goal}\n',
    [`${ROOT}/.claude/tasks/teammate.md`]: '<!-- extend -->\nRun `make check` before you report.',
  }
  const host = fakeHost(on, [], seed)
  await $.session.start(SESSION)
  await $.prompt.submit(prompt('a backlog task'))
  await $.tool.call({ ...create, when: 'backlog' })
  expect(host.files.get(`${ROOT}/work/BUG-01.md`)).toContain('---\n# BUG-01 Fix login\nNo loop\n')

  await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'Fix BUG-01.', name: 'auth' })
  expect(host.spawned.at(-1)).toContain('Fix BUG-01.\n\n# You are a better-tasks teammate')
  expect(host.spawned.at(-1)).toMatch(/Run `make check` before you report\.$/)
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a2', description: 'd', prompt: 'Find X.' })
  expect(host.spawned.at(-1)).toBe('Find X.')
})

test('a broken config.json is logged once and the defaults apply', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [], { [`${ROOT}/.claude/tasks/config.json`]: '{ taskPrefix: ' })
  await $.session.start(SESSION)
  await clock.advance(120_000)
  expect(host.notices.filter(line => line.includes('config.json'))).toHaveLength(1)
  await $.prompt.submit(prompt('a backlog task'))
  await $.tool.call({ ...create, when: 'backlog' })
  expect(host.files.has(`${TASKS}/T-001-fix-login.md`)).toBe(true)
})

test('project_init writes the starter files once and keeps edits', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [], { [`${ROOT}/.claude/tasks/tips.md`]: 'my tips' })
  await $.session.start(SESSION)
  const first = await $.tool.call({ tool: 'mcp__better-tasks__project_init', tool_use_id: 'i1' })
  expect(String(first.result)).toContain('Wrote .claude/tasks/config.json, .claude/tasks/coordinator.md')
  expect(String(first.result)).not.toContain('tips.md')
  expect(host.files.get(`${ROOT}/.claude/tasks/tips.md`)).toBe('my tips')
  const again = await $.tool.call({ tool: 'mcp__better-tasks__project_init', tool_use_id: 'i2' })
  expect(String(again.result)).toContain('All override files exist already.')
})

test('tasks keep their order: new ones at the end, now at the top, a move lands at the edge', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  await $.session.start(SESSION)
  await $.prompt.submit(prompt('tasks for this sprint, one now'))
  for (const [id, title, when] of [['t1', 'One', 'this-sprint'], ['t2', 'Two', 'this-sprint'], ['t3', 'Hot', 'now'], ['t4', 'Hotter', 'now']] as const) {
    await $.tool.call({ ...create, tool_use_id: id, title, when })
  }
  const orderOf = (file: string) => host.files.get(`${TASKS}/${file}`)?.match(/^order: (-?\d+)$/m)?.[1]
  expect([orderOf('T-001-one.md'), orderOf('T-002-two.md'), orderOf('T-003-hot.md'), orderOf('T-004-hotter.md')]).toEqual(['0', '1', '0', '-1'])

  await $.tool.call({ tool: 'mcp__better-tasks__task_update', tool_use_id: 'u1', id: 'T-003', when: 'this-sprint' })
  expect(orderOf('T-003-hot.md')).toBe('2')
  const list = String((await $.tool.call({ tool: 'mcp__better-tasks__task_list', tool_use_id: 'l1' })).result)
  expect(list.split('\n').map(line => line.split(' ')[0])).toEqual(['T-004', 'T-001', 'T-002', 'T-003'])
})

test('changing the sprint length mid-sprint keeps every task, on a boundary', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  await $.session.start(SESSION)
  await $.prompt.submit(prompt('two tasks for this sprint'))
  await $.tool.call({ ...create, when: 'this-sprint', title: 'This week' })
  await $.tool.call({ ...create, tool_use_id: 't2', when: 'next-sprint', title: 'Next week' })
  expect(host.files.get(`${TASKS}/T-002-next-week.md`)).toContain('sprint: 2026-10-12')

  host.files.set(`${ROOT}/.claude/tasks/config.json`, JSON.stringify({ sprintWeeks: '2' }))
  await clock.advance(60_000)
  expect(host.files.get(`${TASKS}/T-001-this-week.md`)).toContain('sprint: 2026-09-28')
  expect(host.files.get(`${TASKS}/T-002-next-week.md`)).toContain('sprint: 2026-10-12')
  const list = String((await $.tool.call({ tool: 'mcp__better-tasks__task_list', tool_use_id: 'l1', sprint: 'all' })).result)
  expect(list).toBe('T-001 [todo] This week · this sprint\nT-002 [todo] Next week · next sprint')
})

test('the user-facing name of the now section is "Currently working on"', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  fakeHost(on)
  await $.session.start(SESSION)
  await $.tool.call(create)
  const list = String((await $.tool.call({ tool: 'mcp__better-tasks__task_list', tool_use_id: 'l1' })).result)
  expect(list).toBe('T-001 [todo] Fix login · currently working on')
  const entered = await $.prompt.submit(prompt('hi'))
  expect(entered.context?.at(-1)).toContain('Currently working on, not started yet: T-001 Fix login.')
})

test('a project still on .claude/manager/ is moved to .claude/tasks/ once, tasks and all', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const OLD = `${ROOT}/.claude/manager`
  const host = fakeHost(on, [], {
    [`${OLD}/tasks/T-001-fix-login.md`]: '---\nid: T-001\ntitle: Fix login\nsprint: 2026-10-05\nstatus: todo\n---\n',
    [`${OLD}/sprints.md`]: '# Sprints\n',
    [`${OLD}/config.json`]: JSON.stringify({ sprintsFile: '.claude/manager/sprints.md', taskPrefix: 'BUG-' }),
    [`${OLD}/teammate.md`]: 'Be brief.',
  })
  await $.session.start(SESSION)
  await clock.advance(0)
  expect([...host.files.keys()].filter(path => path.includes('/.claude/')).sort()).toEqual([
    `${ROOT}/.claude/tasks/T-001-fix-login.md`,
    `${ROOT}/.claude/tasks/config.json`,
    `${ROOT}/.claude/tasks/sprints.md`,
    `${ROOT}/.claude/tasks/teammate.md`,
  ])
  expect(JSON.parse(host.files.get(`${ROOT}/.claude/tasks/config.json`) ?? '{}')).toEqual({ sprintsFile: '.claude/tasks/sprints.md', taskPrefix: 'BUG-' })
  expect(host.notices).toContain('better-tasks: moved .claude/manager/ to .claude/tasks/ (tasks, sprints, settings)')
  const list = String((await $.tool.call({ tool: 'mcp__better-tasks__task_list', tool_use_id: 'l1' })).result)
  expect(list).toBe('T-001 [todo] Fix login · this sprint')
})

test('no move when the project already has .claude/tasks/', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [], {
    [`${ROOT}/.claude/manager/sprints.md`]: 'old',
    [`${ROOT}/.claude/tasks/sprints.md`]: 'new',
  })
  await $.session.start(SESSION)
  await clock.advance(0)
  expect(host.files.get(`${ROOT}/.claude/manager/sprints.md`)).toBe('old')
  expect(host.notices.some(line => line.includes('moved'))).toBe(false)
})

const TRANSCRIPTS = '/home/me/.claude/projects/-project/lead-session/subagents'

function stepsFor(on: On, reads: Record<string, number>) {
  on('turn.step', async function* ($, e) {
    const usage = { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: reads[e.agentId ?? ''] ?? 0, cache_creation_input_tokens: 0, model: 'm' }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage }
  })
}

async function step($: Engine, agentId: string) {
  for await (const chunk of $.turn.step({ turnId: 't', index: 0, model: 'm', messageCount: 1, agentId })) void chunk
}

test('the 1-hour cache is set for teammates and the manager, unless the user chose a TTL', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [], {}, { env: { ...TEAMS_ON, CLAUDE_CODE_PROMPT_CACHE_TTL: '5m' }, settingsEnv: TEAMS_ON })
  await $.session.start(SESSION)
  expect(host.env.get('CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL')).toBe('1h')
  expect(host.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL')).toBe('5m')
})

test('no 1-hour cache when longCache is off', { options: { longCache: false } }, async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  await $.session.start(SESSION)
  expect(host.env.has('CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL')).toBe(false)
})

test('a cold cache is a signal, not a block: a successor gets its predecessor\'s transcript', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [mate('a1', 'auth')], { [`${TRANSCRIPTS}/agent-a1-auth.jsonl`]: '{}' })
  host.env.set('HOME', '/home/me')
  stepsFor(on, { a1: 20_000 })
  await $.session.start(SESSION)
  await step($, 'a1')
  const status = async () => String((await $.tool.call({ tool: 'mcp__better-tasks__team_status', tool_use_id: 'ts' })).result)
  expect(await status()).toBe('auth · idle · context 10 % · cache warm 55m')

  await clock.advance(14 * 60_000)
  expect(await status()).toBe('auth · idle · context 10 % · cache warm 41m')

  await clock.advance(42 * 60_000)
  expect(await status()).toBe('auth · idle · context 10 % · cache cold')
  const cold = await $.tool.call({ tool: 'SendMessage', tool_use_id: 's1', to: 'auth', message: 'and the signup' })
  expect(cold.result).toBe('sent')
  const entered = await $.prompt.submit(prompt('hi'))
  expect(entered.context?.at(-1)).toContain('Teammate auth · idle · context 10 % · cache cold')

  await $.tool.call({ tool: 'Agent', tool_use_id: 'a2', description: 'd', prompt: 'Finish T-001.', name: 'auth-2' })
  expect(host.spawned.at(-1)).toMatch(/^Finish T-001\.\n\nauth's transcript, to search: .*agent-a1-auth\.jsonl\n\n# You are a better-tasks teammate/)
  expect(host.spawned.at(-1)).toContain(`${TRANSCRIPTS}/agent-a1-auth.jsonl`)
})

test('with the 5-minute cache a teammate is cold after 4 minutes', { options: { longCache: false } }, async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  fakeHost(on, [mate('a1', 'auth')])
  stepsFor(on, { a1: 20_000 })
  await $.session.start(SESSION)
  await step($, 'a1')
  const status = async () => String((await $.tool.call({ tool: 'mcp__better-tasks__team_status', tool_use_id: 'ts' })).result)
  await clock.advance(3 * 60_000)
  expect(await status()).toContain('cache warm')
  await clock.advance(60_000)
  expect(await status()).toContain('cache cold')
})

test('every named teammate is spawned with the teammate rules; a scout is not', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'Finish T-001. Old transcript: x.jsonl', name: 'auth-2' })
  expect(host.spawned.at(-1)).toMatch(/^Finish T-001\. Old transcript: x\.jsonl\n\n# You are a better-tasks teammate\n/)
  expect(host.spawned.at(-1)).toContain("Given a predecessor's transcript? Search it for what you need")
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a2', description: 'd', prompt: 'Find the login code.' })
  expect(host.spawned.at(-1)).toBe('Find the login code.')
})

const OWNED = `---\nid: T-003\ntitle: Login redirect\nsprint: 2026-10-05\nstatus: doing\nowner: auth\n---\n## Goal\nLand where you were going.\n\n## Notes\n`

test('a message about an existing task: the note goes on it, and the owner is named to point to it', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [mate('a1', 'auth')], { [`${TASKS}/T-003-login-redirect.md`]: OWNED })
  stepsFor(on, { a1: 20_000 })
  await $.session.start(SESSION)
  await step($, 'a1')

  const entered = await $.prompt.submit(prompt('the login redirect still loops on Safari'))
  expect(entered.context?.at(-1)).toContain('Open tasks (match the message against these):\n- T-003 Login redirect · this sprint · auth')

  const noted = await $.tool.call({ tool: 'mcp__better-tasks__task_note', tool_use_id: 'n1', id: 'T-003', note: 'Still loops on Safari.' } as never)
  expect(String(noted.result)).toBe(
    `Noted on T-003 Login redirect.\nOwner auth (cache warm 55m, 10 %): send it one line with SendMessage, "T-003: new note in ${TASKS}/T-003-login-redirect.md", or route to a fresh teammate by the routing rules.`,
  )
  expect(host.files.get(`${TASKS}/T-003-login-redirect.md`)).toContain('## Notes\n- 2026-10-05: Still loops on Safari.\n')
  expect([...host.files.keys()].filter(path => path.startsWith(`${TASKS}/T-`))).toEqual([`${TASKS}/T-003-login-redirect.md`])

  const next = await $.prompt.submit(prompt('thanks'))
  expect(next.context?.at(-1)).not.toContain('was not filed')
})

test('task_update changes the title and the goal when the user does', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [], { [`${TASKS}/T-003-login-redirect.md`]: OWNED })
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'mcp__better-tasks__task_update', tool_use_id: 'u1', id: 'T-003', title: 'Login redirect on Safari', goal: 'No loop on Safari.' })
  const file = host.files.get(`${TASKS}/T-003-login-redirect.md`) ?? ''
  expect(file).toContain('title: Login redirect on Safari\n')
  expect(file).toContain('## Goal\nNo loop on Safari.\n\n## Notes\n')
})

test('a message left unfiled gets one gentle line next time; a status question does not', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  fakeHost(on)
  await $.session.start(SESSION)
  const reminder = 'Your last message was not filed.'
  await $.prompt.submit(prompt('what is in this sprint?'))
  expect((await $.prompt.submit(prompt('the export button is too small'))).context?.at(-1)).not.toContain(reminder)
  expect((await $.prompt.submit(prompt('put it in the backlog'))).context?.at(-1)).toContain(reminder)
  await $.tool.call({ ...create, when: 'backlog', tool_use_id: 'c9' })
  expect((await $.prompt.submit(prompt('next one'))).context?.at(-1)).not.toContain(reminder)
})

const GLOBAL_RULES = '/home/me/.claude/CLAUDE.md'
const pointers = (host: Host) => host.pluginPrompts.filter(text => text.includes('global instructions'))

test('the global CLAUDE.md is pointed at our team rules: asked once, never when the marker is there', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [], { [GLOBAL_RULES]: '# Me\n\n## Agent teams\n- Route every message.\n' })
  host.env.set('HOME', '/home/me')
  await $.session.start(SESSION)
  expect(pointers(host)).toHaveLength(1)
  expect(pointers(host)[0]).toContain(`Edit ${GLOBAL_RULES} with the Edit tool`)
  expect(pointers(host)[0]).toContain('```markdown\n## Agent teams\n<!-- better-tasks -->\nWhen better-tasks is enabled')
  expect(host.files.get(GLOBAL_RULES)).toBe('# Me\n\n## Agent teams\n- Route every message.\n')

  await $.session.start(SESSION)
  expect(pointers(host)).toHaveLength(1)
})

test('no CLAUDE.md pointer prompt when the marker is already there', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [], { [GLOBAL_RULES]: '## Agent teams\n<!-- better-tasks -->\nFollow better-tasks.\n' })
  host.env.set('HOME', '/home/me')
  await $.session.start(SESSION)
  expect(pointers(host)).toEqual([])
})

test('no CLAUDE.md yet: Claude is asked to create it with only our section; not in a -p run', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  host.env.set('HOME', '/home/me')
  await $.session.start({ ...SESSION, isInteractive: false })
  expect(pointers(host)).toEqual([])
  await $.session.start(SESSION)
  expect(pointers(host)[0]).toContain(`Create ${GLOBAL_RULES} with the Write tool`)
})

test('a teammate spawned for a task reads as its title and id in the agent list', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const file = `${TASKS}/T-004-fix-login.md`
  const host = fakeHost(on, [], { [file]: '---\nid: T-004\ntitle: Fix the login redirect after a password reset\nsprint: 2026-10-05\nstatus: todo\nowner: billing-export\n---\n' })
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', name: 'login', description: 'encoder', prompt: `You own task T-004. The task file is ${file}.` })
  expect(host.descriptions.at(-1)).toBe('Fix the login redirect after a password… · T-004')
  expect(host.spawned.at(-1)).toMatch(new RegExp(`^Fix the login redirect after a password… · T-004\\n\\nYou own task T-004\\. The task file is `))

  await $.tool.call({ tool: 'Agent', tool_use_id: 'a2', name: 'billing-export', description: 'export', prompt: 'Carry on.' })
  expect(host.descriptions.at(-1)).toBe('Fix the login redirect after a password… · T-004')

  await $.tool.call({ tool: 'Agent', tool_use_id: 'a3', name: 'ci', description: 'Speed up CI', prompt: 'Make CI faster.' })
  expect(host.descriptions.at(-1)).toBe('Speed up CI')
  expect(host.spawned.at(-1)).toMatch(/^Make CI faster\.\n\n# You are a better-tasks teammate/)
})

test('task_search finds closed and older tasks, one compact line each', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  fakeHost(on, [], {
    [`${TASKS}/T-003-login-redirect.md`]: OWNED,
    [`${TASKS}/T-001-old.md`]: '---\nid: T-001\ntitle: Session cookie\nsprint: 2026-09-21\nstatus: done\n---\n## Goal\nThe login redirect drops the cookie.\n',
  })
  await $.session.start(SESSION)
  const found = await $.tool.call({ tool: 'mcp__better-tasks__task_search', tool_use_id: 's1', query: 'login redirect' } as never)
  expect(String(found.result)).toBe(
    'T-003 Login redirect · this sprint · auth\n' +
      'T-001 Session cookie · done: The login redirect drops the cookie.',
  )
  const none = await $.tool.call({ tool: 'mcp__better-tasks__task_search', tool_use_id: 's2', query: 'banana' } as never)
  expect(String(none.result)).toBe('No task matches "banana".')
})

const statusPrompts = (host: Host) => host.pluginPrompts.filter(text => text.startsWith('better-tasks status check'))
const ACTIVE = `---\nid: T-001\ntitle: Fix login\nsprint: 2026-10-05\nstatus: doing\nowner: login\n---\n## Goal\nNo loop.\n\n## Notes\n`

test('after 10 quiet minutes with work open, the coordinator is asked for a status check', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [], { [`${TASKS}/T-001-fix-login.md`]: ACTIVE })
  await $.session.start(SESSION)
  await clock.advance(9 * 60_000)
  expect(statusPrompts(host)).toEqual([])
  await clock.advance(60_000)
  expect(statusPrompts(host)).toHaveLength(1)
  expect(statusPrompts(host)[0]).toContain('better-tasks status check: no activity for 10 min. Move the work forward.\n1. Call team_status.')
})

test('no status check with nothing open, while a turn runs, or with text in the composer', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  await $.session.start(SESSION)
  await clock.advance(15 * 60_000)
  expect(statusPrompts(host)).toEqual([])

  host.files.set(`${TASKS}/T-001-fix-login.md`, ACTIVE)
  await $.turn.start({ text: 'working', turnId: 't1' })
  await clock.advance(30 * 60_000)
  expect(statusPrompts(host)).toEqual([])
})

test('text in the composer holds the status check back', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [], { [`${TASKS}/T-001-fix-login.md`]: ACTIVE })
  host.composer = 'half a thou'
  await $.session.start(SESSION)
  await clock.advance(20 * 60_000)
  expect(statusPrompts(host)).toEqual([])
  host.composer = ''
  await clock.advance(60_000)
  expect(statusPrompts(host)).toHaveLength(1)
})

test('nothing changed: no repeat, the wait grows; a change brings the next check', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [], { [`${TASKS}/T-001-fix-login.md`]: ACTIVE })
  await $.session.start(SESSION)
  await clock.advance(10 * 60_000)
  expect(statusPrompts(host)).toHaveLength(1)
  await clock.advance(40 * 60_000) // quiet checks at 20, 30 and 50 min
  expect(statusPrompts(host)).toHaveLength(1)
  host.files.set(`${TASKS}/T-001-fix-login.md`, `${ACTIVE}- 2026-10-05: blocked on the API key\n`)
  await clock.advance(39 * 60_000) // the next check is due 40 min after the last one
  expect(statusPrompts(host)).toHaveLength(1)
  await clock.advance(60_000)
  expect(statusPrompts(host)).toHaveLength(2)
})

const updateT1 = { tool: 'mcp__better-tasks__task_update', tool_use_id: 'u1', id: 'T-001' } as const

test('only the lead closes a task: a teammate setting done or cancelled is refused', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [mate('a1', 'login')], { [`${TASKS}/T-001-fix-login.md`]: ACTIVE })
  await $.session.start(SESSION)
  const done = await $.tool.call({ ...updateT1, status: 'done', agentId: 'a1' } as never)
  expect(done.deny).toContain('Only the lead closes T-001, once the user marks it resolved.')
  expect((await $.tool.call({ ...updateT1, status: 'cancelled', agentId: 'a1' } as never)).deny).toBeDefined()
  expect(host.files.get(`${TASKS}/T-001-fix-login.md`)).toContain('status: doing')

  expect((await $.tool.call({ ...updateT1, note: 'half way', agentId: 'a1' } as never)).deny).toBeUndefined()
  await $.tool.call({ ...updateT1, status: 'done', note: 'Works', commits: 'abc123' } as never)
  expect(host.files.get(`${TASKS}/T-001-fix-login.md`)).toContain('status: done')
})

test('a task the user resolved is named to the lead until it is closed', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const finishing = { 'T-001 Fix login\nWhat changed: no loop.\nIs everything OK?': 'Mark as resolved', 'T-002 Other\nIs everything OK?': 'Request changes' }
  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: { answers: finishing } })) // before fakeHost: the first answer wins
  const host = fakeHost(on, [], { [`${TASKS}/T-001-fix-login.md`]: ACTIVE })
  await $.session.start(SESSION)
  await $.prompt.submit(prompt('T-001 is ready'))
  await $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'q1', questions: [] } as never)
  const reminded = await $.prompt.submit(prompt('anything else?'))
  expect(reminded.context?.at(-1)).toContain('The user marked T-001 resolved, still open: close each now')

  await $.tool.call({ ...updateT1, status: 'done', note: 'Works', commits: 'abc123' } as never)
  expect((await $.prompt.submit(prompt('thanks'))).context?.at(-1)).not.toContain('marked T-001 resolved')
  await $.tool.call({ ...updateT1, status: 'doing' } as never) // reopened later: not closed again
  expect((await $.prompt.submit(prompt('it broke again'))).context?.at(-1)).not.toContain('marked T-001 resolved')
  expect(host.files.get(`${TASKS}/T-001-fix-login.md`)).toContain('status: doing')
})

test('startup asks once about before/after videos; Enable turns them on and sets up the voice', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  let asked = 0
  on('tool.call', { tool: 'AskUserQuestion' }, () => {
    asked += 1
    return { result: { answers: { [QUESTION]: ENABLE_OPTION } } }
  })
  const set: unknown[] = []
  on('config.set', ($, e) => {
    set.push([e.key, e.value])
    return { value: e.value }
  })
  const host = fakeHost(on)
  host.spawnOutput = 'ready /home/.local/share/better-tasks/kokoro\n'
  await $.session.start(SESSION)
  await clock.advance(0)
  expect(asked).toBe(1)
  expect(set).toEqual([['better-tasks.demoVideos', true]])
  expect(host.spawnedArgv.some(argv => argv.at(-1)?.endsWith('/bin/kokoro-setup.sh'))).toBe(true)
  expect(host.toasts).toContain('Kokoro voice ready: before/after videos are on.')

  await $.session.start(SESSION)
  await clock.advance(0)
  expect(asked).toBe(1)
})

test('with before/after videos on, teammates get the video rules and the lead the showing rules', { options: { demoVideos: true } }, async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const teams = { env: { ...TEAMS_ON, HOME: '/home' }, settingsEnv: TEAMS_ON }
  const host = fakeHost(on, [], { '/home/.local/share/better-tasks/kokoro/.ready': '' }, teams)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'p', name: 'auth' })
  expect(host.spawned[0]).toContain('/bin/demo-video.sh spec.json')
  const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], outputStyle: null, tools: ['Agent'], traits: [] })
  expect(composed.sections.at(-1)?.text).toContain('Demo video: <path>')
  expect(host.toasts).toEqual([])
})
