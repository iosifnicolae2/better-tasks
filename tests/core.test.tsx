import type { AgentInfo, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { PANE_COMMANDS } from '../hooks/pane'
import { SCREEN_COMMANDS } from '../hooks/screen'

const ROOT = '/project'
const TASKS = `${ROOT}/.claude/manager/tasks`
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
  const host: Host = { files: new Map(Object.entries(seed)), status: [], toasts: [], pluginPrompts: [], notices: [], registered: [] }
  mock.env(on, teams.env)
  on('settings.read', () => ({ value: { env: teams.settingsEnv } }))
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
    return { value: { tool: `mcp__supermanager__${e.name}` } }
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
    const names = [...host.files.keys()].filter(path => path.startsWith(prefix)).map(path => path.slice(prefix.length))
    const entries = names.map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false }))
    return { value: entries }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: { answers: { When: 'Now' } } }))
  on('tool.call', { tool: 'SendMessage' }, () => ({ result: 'sent' }))
  on('tool.call', { tool: 'Agent' }, ($, e) => ({ result: { isolation: e.isolation ?? 'none' } }))
  on('prompt.submit', ($, e) => {
    if (e.origin.kind === 'plugin') host.pluginPrompts.push(e.text)
    return { text: e.text, context: e.context }
  })
  on('process.spawn', async function* () {
    return { value: { code: 0, signal: null } }
  })
  return host
}

const mate = (id: string, name: string): AgentInfo => ({ id, name, description: name, type: 'teammate', status: 'running' })

const prompt = (text: string) => ({ text, origin: { kind: 'composer' }, wait: false }) as const
const create = { tool: 'mcp__supermanager__task_create', tool_use_id: 't1', title: 'Fix login', goal: 'No loop', when: 'now' } as const

test('task_create is refused until the user was asked when', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  await $.session.start(SESSION)
  await $.prompt.submit(prompt('create a task to fix the login loop'))
  const refused = await $.tool.call(create)
  expect(refused.deny ?? refused.text).toContain('Ask the user when first')
  expect([...host.files.keys()].some(path => path.startsWith(TASKS))).toBe(false)

  await $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'q1', questions: [] } as never)
  const made = await $.tool.call(create)
  expect(String(made.result)).toContain('Created T-001 (now)')
  const file = host.files.get(`${TASKS}/T-001-fix-login.md`)
  expect(file).toContain('sprint: 2026-10-05\nurgent: true\nstatus: todo')
})

test('a prompt that names the time needs no question', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  fakeHost(on)
  await $.session.start(SESSION)
  await $.prompt.submit(prompt('add a backlog task to clean up the logs'))
  const made = await $.tool.call({ ...create, when: 'backlog' })
  expect(String(made.result)).toContain('Created T-001 (backlog)')
})

test('each user prompt carries the sprint context', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  fakeHost(on, [mate('a1', 'auth')])
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'mcp__supermanager__sprint_goal', tool_use_id: 'g1', goal: 'Ship login' })
  const entered = await $.prompt.submit(prompt('hi'))
  expect(entered.context?.at(-1)).toContain('[supermanager] Sprint 41 · Oct 5–11 · goal: Ship login · 0/0 done')
  expect(entered.context?.at(-1)).toContain('Teammate auth · running')
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

  expect(await idsFor('intro', MAIN_TOOLS)).toEqual(['intro', 'supermanager:coordinator'])
  expect(await idsFor('lean_body', MAIN_TOOLS, ['lean'])).toEqual(['lean_body', 'supermanager:coordinator'])
  expect(await idsFor('intro', MAIN_TOOLS, ['teammate'])).toEqual(['intro'])
  expect(await idsFor('intro', ['Read', 'Grep', 'Bash'])).toEqual(['intro']) // an Explore scout: no Agent tool
  expect(await idsFor('agent_prompt', MAIN_TOOLS)).toEqual(['agent_prompt']) // a subagent's own prompt
})

test('SendMessage to a teammate over the context limit is refused with handoff advice', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  fakeHost(on, [mate('a1', 'auth'), mate('a2', 'billing')])
  const fill: Record<string, number> = { a1: 0.63 * WINDOW, a2: 0.2 * WINDOW }
  on('turn.step', async function* ($, e) {
    const tokens = fill[e.agentId ?? ''] ?? 0
    const usage = { input_tokens: tokens, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage }
  })
  await $.session.start(SESSION)
  for (const agentId of ['a1', 'a2']) {
    for await (const chunk of $.turn.step({ turnId: 't', index: 0, model: 'm', messageCount: 1, agentId })) void chunk
  }

  const full = await $.tool.call({ tool: 'SendMessage', tool_use_id: 's1', to: 'auth', message: 'also fix billing' })
  expect(full.deny ?? full.text).toContain('auth is at 63 % context')
  const handoff = await $.tool.call({ tool: 'SendMessage', tool_use_id: 's2', to: 'auth', message: 'HANDOFF: write your notes' })
  expect(handoff.result).toBe('sent')
  const fresh = await $.tool.call({ tool: 'SendMessage', tool_use_id: 's3', to: 'billing', message: 'go' })
  expect(fresh.result).toBe('sent')
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
  await $.tool.call({ tool: 'mcp__supermanager__task_update', tool_use_id: 'u1', id: 'T-002', status: 'done', note: 'Works', commits: 'abc123' })
  expect(host.files.get(`${ROOT}/docs/tasks.md`)).toContain('| T-002 Shipped one | Works | abc123 | session lead-session')

  await clock.advance(3 * 60_000)
  expect(host.files.get(`${TASKS}/T-001-open-one.md`)).toContain('sprint: 2026-10-12\nurgent: false\nstatus: todo\nowner:\nrolled: 1')
  const sprints = host.files.get(`${ROOT}/.claude/manager/sprints.md`) ?? ''
  expect(sprints).toContain('Shipped:\n- T-002 Shipped one\nRolled over:\n- T-001 Open one')
  expect(host.toasts.at(-1)).toContain('Sprint 42 · Oct 12–18 started')
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
  expect(host.pluginPrompts).toEqual([])
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
  expect(entered.context).toEqual(['[supermanager] off: agent teams are not set up (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1).'])
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
    [`${ROOT}/.claude/manager/sprints.md`]: '# Sprints\n\n## 2026-10-05 · Sprint 41 · Oct 5–11\nGoal: Ship login\n',
    [`${TASKS}/T-001-a.md`]: '---\nid: T-001\ntitle: A\nsprint: 2026-10-05\nstatus: todo\n---\n',
    [`${TASKS}/T-002-b.md`]: '---\nid: T-002\ntitle: B\nsprint: 2026-10-05\nstatus: done\n---\n',
    [`${TASKS}/T-003-c.md`]: '---\nid: T-003\ntitle: C\nsprint: backlog\nstatus: todo\n---\n',
  }
  const host = fakeHost(on, [], seed)
  await $.session.start(SESSION)
  await clock.advance(0)
  expect(host.notices).toEqual([
    'supermanager · Sprint 41 · Oct 5–11 · goal: Ship login · 1 open',
    '/supermanager  j/k select · enter menu · 1-4 move · o open · s start · d done',
    '"create a task …" → asks which sprint · "start T-003" → a teammate takes it',
    '/away  screens off, Mac keeps working',
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

  const footer = await $.ui.mount({ plugin: 'supermanager', surface: 'terminal', component: 'SessionMode', props: { modes: ['focus'] } })
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
  expect(host.notices.some(line => line.startsWith(`supermanager: /${first} failed:`))).toBe(true)
  expect(host.notices.some(line => line.startsWith('supermanager · Sprint 41'))).toBe(true)
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
  expect(ours).toEqual(['supermanager', 'away'])
  expect(ours.filter(name => BUILT_IN.includes(name))).toEqual([])
})
