import type { AgentInfo, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { ENABLE_OPTION, QUESTION } from '../hooks/demovideo'
import { pinCommit, TEAM_COMMIT, TEAM_NO, TEAM_QUESTION, TEAM_YES, updateCommit } from '../hooks/teaminstall'
import { DECLINED_KEY, RESTART_LATER, restartLaterLine, restartQuestion, updateQuestion } from '../hooks/updatecheck'
import { IGNORE_COMMIT } from '../hooks/ignoreworktrees'
import { PANE_COMMANDS } from '../hooks/pane'
import { SCREEN_COMMANDS } from '../hooks/screen'
import { TEMPLATES } from './templates.gen'

const ROOT = '/project'
const TASKS = `${ROOT}/.claude/tasks`
const SESSION = { cwd: ROOT, surface: 'terminal', isInteractive: true } as const
const MONDAY_OCT_5 = new Date(2026, 9, 5, 9).getTime()
const SUNDAY_OCT_11_LATE = new Date(2026, 9, 11, 23, 58).getTime()
const WINDOW = 200_000
/** Setup questions wait for a quiet, empty prompt box (2 s) before each one asks. */
const QUIET_PROMPT_BOX = 30_000

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
  /** The subagent_type each Agent call went out with (undefined: none). */
  subagentTypes: (string | undefined)[]
  /** The agent types the plugin registered, in order. */
  agentTypes: { name: string; model?: string; effort?: string | number }[]
  /** The permissionMode of each agent type registered, in order. */
  agentModes: (string | undefined)[]
  /** Set it and every agent.register is refused with this reason. */
  agentDeny?: string
  /** Each process.spawn's argv; spawnOutput is what each one prints. */
  spawnedArgv: string[][]
  spawnOutput: string
  /** What process.run prints, by its argv joined with spaces. */
  runOutput: Record<string, string>
  /** When set, what process.run prints for an argv, ahead of runOutput (undefined: not its command). */
  answerRun?: (argv: readonly string[]) => string | undefined
  /** When set, the stderr of an argv that fails (exit code 1); undefined: it succeeds. */
  failRun?: (argv: readonly string[]) => string | undefined
  /** Each process.run's argv, joined with spaces. */
  ran: string[]
  env: Map<string, string>
  composer: string
}
type Teams = { env: Record<string, string>; settingsEnv: Record<string, string> }

/** The plugin's own instruction templates (tests/templates.gen.ts, written by scripts/test.sh), at any root but the project's. */
function pluginTemplate(path: string): string | undefined {
  const name = path.match(/\/\.claude\/better-tasks\/([^/]+)$/)?.[1]
  return name && !path.startsWith(`${ROOT}/`) ? TEMPLATES[name] : undefined
}

/** The engine beneath the plugin: files in memory, a session, the given agents, agent teams on unless said. */
function fakeHost(
  on: On,
  agents: AgentInfo[] = [],
  seed: Record<string, string> = {},
  teams: Teams = { env: TEAMS_ON, settingsEnv: TEAMS_ON },
  takenNames: string[] = [],
): Host {
  const host: Host = { files: new Map(Object.entries(seed)), status: [], toasts: [], pluginPrompts: [], notices: [], registered: [], spawned: [], descriptions: [], subagentTypes: [], agentTypes: [], agentModes: [], spawnedArgv: [], spawnOutput: '', runOutput: {}, ran: [], env: new Map(), composer: '' }
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
  on('agent.register', ($, e) => {
    if (host.agentDeny) return { deny: host.agentDeny }
    host.agentTypes.push({ name: e.name, model: e.model, effort: e.effort })
    host.agentModes.push(e.permissionMode)
    return { value: { agent: `better-tasks:${e.name}` } }
  })
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
    const text = host.files.get(e.path) ?? pluginTemplate(e.path)
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
    host.ran.push(e.argv.join(' '))
    const [command, ...args] = e.argv
    const paths = args.filter(arg => !arg.startsWith('-'))
    if (command === 'rm') for (const path of paths) host.files.delete(path)
    if (command === 'mv' && paths.length === 2) {
      const [from = '', to = ''] = paths
      for (const [path, text] of [...host.files]) {
        if (path !== from && !path.startsWith(`${from}/`)) continue
        host.files.delete(path)
        host.files.set(to + path.slice(from.length), text)
      }
    }
    const stdout = host.answerRun?.(e.argv) ?? host.runOutput[e.argv.join(' ')] ?? ''
    const stderr = host.failRun?.(e.argv)
    return { value: { exitCode: stderr === undefined ? 0 : 1, stdout, stderr: stderr ?? '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: { answers: { When: 'Now' } } }))
  on('tool.call', { tool: 'SendMessage' }, () => ({ result: 'sent' }))
  on('tool.call', { tool: 'Agent' }, ($, e) => {
    host.spawned.push(e.prompt)
    host.descriptions.push(e.description)
    host.subagentTypes.push(e.subagent_type)
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

test('a task that depends on another waits for it: shown blocked, checked on write, and started when its dependency closes', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [], { [`${TASKS}/T-001-fix-login.md`]: ACTIVE })
  await $.session.start(SESSION)
  await $.prompt.submit(prompt('then the login emails, once the login works'))
  const made = await $.tool.call({ ...create, title: 'Login emails', dependsOn: ['t-001'] } as never)
  expect(String(made.result)).toContain('Created T-002 (currently working on)')
  expect(String(made.result)).toContain('Not started: it waits on T-001; start it once they are done.')
  expect(host.files.get(`${TASKS}/T-002-login-emails.md`)).toContain('created: 2026-10-05\ndependsOn: [T-001]\n---')

  const context = (await $.prompt.submit(prompt('what is next?'))).context?.at(-1)
  expect(context).toContain('Blocked, not started: T-002 Login emails (waits on T-001). Start each once its dependencies are done.')
  expect(context).not.toContain('Route each now')
  const listed = await $.tool.call({ tool: 'mcp__better-tasks__task_list', tool_use_id: 'l1' } as never)
  expect(String(listed.result)).toContain('T-002 [todo] Login emails · currently working on · waits on T-001')

  const unknown = await $.tool.call({ ...create, tool_use_id: 't2', title: 'Other', dependsOn: ['T-009'] } as never)
  expect(unknown.deny).toBe('No task or label T-009: dependsOn takes task ids, or labels other tasks have.')
  const cycle = await $.tool.call({ ...updateT1, dependsOn: ['T-002'] } as never)
  expect(cycle.deny).toBe('That makes a cycle, T-001 → T-002 → T-001: drop one of these dependencies or labels.')
  expect(host.files.get(`${TASKS}/T-001-fix-login.md`)).not.toContain('dependsOn')

  const closed = await $.tool.call({ ...updateT1, status: 'done', note: 'Works', commits: 'abc123' } as never)
  expect(String(closed.result)).toContain('Unblocked: T-002 Login emails. Start each now: its owner or a new teammate.')
  expect((await $.prompt.submit(prompt('go on'))).context?.at(-1)).toContain('Currently working on, not started yet: T-002 Login emails. Route each now')
  await $.tool.call({ tool: 'mcp__better-tasks__task_update', tool_use_id: 'u2', id: 'T-002', dependsOn: [] } as never)
  expect(host.files.get(`${TASKS}/T-002-login-emails.md`)).not.toContain('dependsOn')
})

test('labels: set on tasks, listed in groups, and a label as a dependency waits on all its open tasks', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [], { [`${TASKS}/T-001-fix-login.md`]: ACTIVE })
  await $.session.start(SESSION)
  await $.prompt.submit(prompt('two auth tasks, then the release notes after all of auth'))
  await $.tool.call({ ...updateT1, labels: ['Auth'] } as never)
  await $.tool.call({ ...create, title: 'Login emails', labels: ['auth', 'email'] } as never)
  const notes = await $.tool.call({ ...create, tool_use_id: 't2', title: 'Release notes', dependsOn: ['auth'] } as never)
  expect(String(notes.result)).toContain('Not started: it waits on label auth (T-001, T-002); start it once they are done.')
  expect(host.files.get(`${TASKS}/T-002-login-emails.md`)).toContain('labels: [auth, email]\n---')
  expect(host.files.get(`${TASKS}/T-003-release-notes.md`)).toContain('dependsOn: [auth]\n---')

  const grouped = await $.tool.call({ tool: 'mcp__better-tasks__task_list', tool_use_id: 'l1', group: 'label' } as never)
  expect(String(grouped.result)).toBe(
    'auth:\nT-001 [doing] Fix login · this sprint · owner login · labels auth\nT-002 [todo] Login emails · currently working on · labels auth, email\n\n' +
      'email:\nT-002 [todo] Login emails · currently working on · labels auth, email\n\n' +
      'no label:\nT-003 [todo] Release notes · currently working on · waits on label auth (T-001, T-002)',
  )
  const idLike = await $.tool.call({ ...updateT1, labels: ['t-7'] } as never)
  expect(idLike.deny).toBe('t-7 reads as a task id: pick another label.')
  const cycle = await $.tool.call({ ...updateT1, dependsOn: ['T-003'] } as never)
  expect(cycle.deny).toBe('That makes a cycle, T-001 → T-003 → T-001: drop one of these dependencies or labels.')

  await $.tool.call({ ...updateT1, status: 'done', note: 'Works', commits: 'abc123' } as never)
  const last = await $.tool.call({ tool: 'mcp__better-tasks__task_update', tool_use_id: 'u2', id: 'T-002', status: 'done', note: 'Sent' } as never)
  expect(String(last.result)).toContain('Unblocked: T-003 Release notes. Start each now')
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

test("the lead's rules: the task scenario, one question per task, the video before it, tests and PR after the yes", async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  fakeHost(on)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))
  const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], outputStyle: null, tools: ['Agent'], traits: [] })
  const lead = composed.sections.find(section => section.id === 'better-tasks:coordinator')?.text ?? ''
  expect(lead).toMatch(/^# better-tasks: you lead a team of Claude Code teammates\n/)
  expect(lead).toContain('## How a task goes')
  expect(lead).toContain('Ask the user about one task at a time: one question, never two tasks in it or two questions at once')
  expect(lead).toContain('goes in your text just above the question and again inside it')
  expect(lead).toContain('tell the teammate "<id> accepted: finish it"')
  expect(lead).toContain('load the `better-tasks:contribute` skill')
  expect(lead).not.toContain('{%')
})

test("our skills load as their template, rendered with the settings in force; others pass through", { options: { demoVideos: true, videoQuality: 'low' } }, async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  fakeHost(on)
  on('skill.prompt', ($, e) => ({ text: e.text }))
  const video = await $.skill.prompt({ skill: 'better-tasks:video', text: 'pointer' })
  expect(video.text).toMatch(/^# Before\/after video\n/)
  expect(video.text).toMatch(/`\/\S+\/bin\/demo-video\.sh spec\.json --quality low`/)
  expect((await $.skill.prompt({ skill: 'better-tasks:testing', text: 'T' })).text).toContain("the project's own virtual display")
  expect((await $.skill.prompt({ skill: 'better-tasks:contribute', text: 'C' })).text).toContain('header "PR upstream"')
  expect((await $.skill.prompt({ skill: 'better-tasks:done', text: 'D' })).text).toMatch(/^# Reporting done\n/)
  expect((await $.skill.prompt({ skill: 'better-tasks:tester', text: 'Q' })).text).toMatch(/^# You are the tester of a batch\n/)
  expect((await $.skill.prompt({ skill: 'commit', text: 'X ${CLAUDE_PLUGIN_ROOT}' })).text).toBe('X ${CLAUDE_PLUGIN_ROOT}')
})

test('a setting changed mid-session: the system prompt stays as it started; the next message carries only the changed sections, once', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))
  await $.session.start(SESSION)
  const leadNow = async () => (await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], outputStyle: null, tools: ['Agent'], traits: [] })).sections.at(-1)?.text ?? ''
  const started = await leadNow()
  expect(started).toContain('Straight to main')
  expect((await $.prompt.submit(prompt('hi'))).context?.join('\n')).not.toContain('a setting changed')

  host.files.set(`${ROOT}/.claude/tasks/config.json`, JSON.stringify({ gitFlow: 'worktree-prs' }))
  const context = (await $.prompt.submit(prompt('go on'))).context?.join('\n') ?? ''
  expect(context).toContain('better-tasks: a setting changed.')
  expect(context).toContain('## Git flow\nA worktree and a PR per task')
  expect(context).not.toContain('## Routing')
  expect(context).toContain('Send each running teammate')
  expect(await leadNow()).toBe(started)
  expect((await $.prompt.submit(prompt('and now'))).context?.join('\n')).not.toContain('a setting changed')

  await $.session.start(SESSION)
  expect(await leadNow()).toContain('A worktree and a PR per task')
})

test("a project's file of the same name extends a skill, or replaces it", async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [], { [`${ROOT}/.claude/better-tasks/done.md`]: 'Also run `make lint`{% if demoVideos %} before the video{% endif %}.' })
  on('skill.prompt', ($, e) => ({ text: e.text }))
  const extended = (await $.skill.prompt({ skill: 'better-tasks:done', text: 'D' })).text
  expect(extended).toMatch(/^# Reporting done\n[\s\S]*\n\nAlso run `make lint`\.$/)
  host.files.set(`${ROOT}/.claude/better-tasks/done.md`, '---\nreplace: true\n---\nOur own way.')
  expect((await $.skill.prompt({ skill: 'better-tasks:done', text: 'D' })).text).toBe('Our own way.')
  host.files.set(`${ROOT}/.claude/better-tasks/done.md`, '{% if nope %}x{% endif %}')
  expect((await $.skill.prompt({ skill: 'better-tasks:done', text: 'D' })).text).toMatch(/^# Reporting done\n/)
  expect(host.notices.some(line => line.includes('.claude/better-tasks/done.md failed'))).toBe(true)
})

test('with worktree on, a named teammate is spawned in a worktree', { options: { worktree: true, worktreeSandbox: true } }, async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  fakeHost(on)
  await $.session.start(SESSION)
  const named = await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'p', name: 'auth' })
  expect(named.result).toEqual({ isolation: 'worktree' })
  const scout = await $.tool.call({ tool: 'Agent', tool_use_id: 'a2', description: 'd', prompt: 'p' })
  expect(scout.result).toEqual({ isolation: 'none' })
})

test('a teammate in the shared checkout gets no worktree command rules', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'p', name: 'auth' })
  expect(host.spawned[0]).not.toContain('stay in your worktree')
})

test('a teammate the lead spawns in a worktree itself gets the worktree command rules', { options: { worktreeSandbox: true } }, async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'p', name: 'auth', isolation: 'worktree' })
  expect(host.spawned[0]).toContain('must plainly stay in your worktree')
})

const AUTH_WORKTREE = `${ROOT}/.claude/worktrees/auth`

test('worktrees without the sandbox, the default: better-tasks makes the worktree with git and spawns the teammate unisolated, told its path', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  host.failRun = argv => (argv.includes('--verify') || argv.join(' ').endsWith('origin/HEAD') ? 'no such ref' : undefined)
  await $.session.start(SESSION)
  const named = await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'p', name: 'Auth', isolation: 'worktree' })
  expect(named.result).toEqual({ isolation: 'none' })
  expect(host.ran).toContain(`git -C ${ROOT} worktree add -b worktree-auth ${AUTH_WORKTREE} HEAD`)
  expect(host.spawned[0]).toContain(`Your own worktree \`${AUTH_WORKTREE}\`, on branch \`worktree-auth\``)
  expect(host.spawned[0]).toContain(`start each command with \`cd ${AUTH_WORKTREE} && \``)
  expect(host.spawned[0]).toContain('In the main checkout, edit only your task file')
  expect(host.spawned[0]).not.toContain('must plainly stay')
})

test('without the sandbox, a respawn reuses its worktree, or its branch; the remote default branch is the base, as Claude Code does', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  host.answerRun = argv => (argv.includes('--porcelain') ? `worktree ${ROOT}\nHEAD abc\n\nworktree ${AUTH_WORKTREE}\nbranch refs/heads/worktree-auth\n` : argv.at(-1) === 'origin/HEAD' ? 'origin/main\n' : undefined)
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'p', name: 'auth', isolation: 'worktree' })
  expect(host.ran.some(line => line.includes('worktree add'))).toBe(false)
  host.failRun = argv => (argv.includes('--verify') ? 'no such ref' : undefined)
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a2', description: 'd', prompt: 'p', name: 'login', isolation: 'worktree' })
  expect(host.ran).toContain(`git -C ${ROOT} worktree add -b worktree-login ${ROOT}/.claude/worktrees/login origin/main`)
  host.failRun = undefined
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a3', description: 'd', prompt: 'p', name: 'cart', isolation: 'worktree' })
  expect(host.ran).toContain(`git -C ${ROOT} worktree add ${ROOT}/.claude/worktrees/cart worktree-cart`)
})

test('without the sandbox, git failing to make the worktree falls back to an isolated one with its rules, said in one line', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  host.failRun = argv => (argv.includes('add') ? 'fatal: not a git repository' : undefined)
  await $.session.start(SESSION)
  const named = await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'p', name: 'auth', isolation: 'worktree' })
  expect(named.result).toEqual({ isolation: 'worktree' })
  expect(host.spawned[0]).toContain('must plainly stay in your worktree')
  expect(host.notices).toContain("better-tasks: making auth's worktree failed (fatal: not a git repository); it runs in Claude Code's isolated worktree instead.")
})

test('without the sandbox, the gitignored files .worktreeinclude names are copied into a new worktree', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [], { [`${ROOT}/.worktreeinclude`]: '.env\n' })
  host.answerRun = argv => (argv.includes('--exclude-standard') ? '.env\nconfig/local.json\nnode_modules/x.js\n' : argv.some(arg => arg.startsWith('--exclude-from=')) ? '.env\nconfig/local.json\nREADME.md\n' : undefined)
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'p', name: 'auth', isolation: 'worktree' })
  expect(host.ran).toContain(`cp -p ${ROOT}/.env ${AUTH_WORKTREE}/.env`)
  expect(host.ran).toContain(`cp -p ${ROOT}/config/local.json ${AUTH_WORKTREE}/config/local.json`)
  expect(host.ran).toContain(`mkdir -p ${AUTH_WORKTREE}/config`)
  expect(host.ran.some(line => line.includes('README.md') || line.includes('node_modules'))).toBe(false)
})

const EXCLUDED = '<excludeFolder url="file://$MODULE_DIR$/.claude/worktrees" />'
const IDE_NOTICE = 'better-tasks: IntelliJ now skips .claude/worktrees/ (teammate worktrees), so they are not indexed'

/** Answers every startup question: videos "No", the git flow `flow`; returns the questions asked. */
function answerStartup(on: On, flow: string): string[] {
  const asked: string[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const question = (e as { questions: { question: string }[] }).questions[0]?.question ?? ''
    asked.push(question)
    return { result: { answers: { [question]: question === QUESTION ? 'No' : flow } } }
  })
  return asked
}

test('worktrees in an IntelliJ project: IntelliJ skips them by default, unasked, now and at each start', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const asked = answerStartup(on, 'Worktree and PR per task')
  const host = fakeHost(on, [], { [`${ROOT}/.idea/misc.xml`]: '<project />' })
  host.runOutput['git remote -v'] = 'origin\tgit@github.com:someone/app.git (fetch)\n'
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(asked.some(question => question.includes('IntelliJ'))).toBe(false)
  expect(host.files.get(`${ROOT}/.idea/project.iml`)).toContain(EXCLUDED)
  expect(host.notices).toContain(IDE_NOTICE)

  host.files.delete(`${ROOT}/.idea/project.iml`)
  host.files.delete(`${ROOT}/.idea/modules.xml`)
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(host.files.get(`${ROOT}/.idea/project.iml`)).toContain(EXCLUDED)
})

test('"excludeWorktreesFromIde": false leaves .idea as it is', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  answerStartup(on, 'Worktree and PR per task')
  const host = fakeHost(on, [], {
    [`${ROOT}/.idea/misc.xml`]: '<project />',
    [`${ROOT}/.claude/tasks/config.json`]: JSON.stringify({ gitFlow: 'worktree-prs', excludeWorktreesFromIde: false }),
  })
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(host.files.has(`${ROOT}/.idea/project.iml`)).toBe(false)
})

test('first run, any git flow: IntelliJ skips the worktrees and .gitignore gets them, committed alone', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  answerStartup(on, 'Straight to main')
  const host = fakeHost(on, [], { [`${ROOT}/.idea/misc.xml`]: '<project />', [`${ROOT}/.gitignore`]: 'dist' })
  host.runOutput['git remote -v'] = 'origin\tgit@github.com:someone/app.git (fetch)\n'
  host.runOutput[`git -C ${ROOT} check-ignore -n -v .claude/worktrees/`] = '::\t.claude/worktrees/\n'
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(host.files.get(`${ROOT}/.idea/project.iml`)).toContain(EXCLUDED)
  expect(host.files.get(`${ROOT}/.gitignore`)).toBe('dist\n.claude/worktrees/\n')
  expect(host.ran).toContain(`git -C ${ROOT} commit --quiet -m ${IGNORE_COMMIT} --only -- .gitignore`)
})

test('worktrees already ignored by git: .gitignore is left as it is', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  answerStartup(on, 'Straight to main')
  const host = fakeHost(on, [], { [`${ROOT}/.gitignore`]: '.claude/\n' })
  host.runOutput[`git -C ${ROOT} check-ignore -n -v .claude/worktrees/`] = '.gitignore:1:.claude/\t.claude/worktrees/\n'
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(host.files.get(`${ROOT}/.gitignore`)).toBe('.claude/\n')
  expect(host.ran.some(command => command.includes(IGNORE_COMMIT))).toBe(false)
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

test('the footer recounts as soon as a task closes, before the next prompt', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  fakeHost(on, [])
  const drawn: string[][] = []
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    drawn.push([...e.props.modes])
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.modes.join(' & ')}</Text>
  })
  await $.session.start(SESSION)
  await $.prompt.submit(prompt('add this now: fix the login loop'))
  await $.tool.call(create)
  await $.tool.call({ tool: 'mcp__better-tasks__task_update', tool_use_id: 'u1', id: 'T-001', status: 'done', note: 'Works', commits: 'abc123' })

  const footer = await $.ui.mount({ plugin: 'better-tasks', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
  expect(drawn.at(-1)).toEqual(['Sprint 41 · 1/1 done'])
  await footer.unmount()
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
  expect(host.spawned.at(-1)).toContain('Run `make check` before you report.')
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
  expect(String(first.result)).toContain('Wrote .claude/tasks/config.json, .claude/better-tasks/lead.md')
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
    `${ROOT}/.claude/better-tasks/teammate.md`,
    `${ROOT}/.claude/tasks/T-001-fix-login.md`,
    `${ROOT}/.claude/tasks/config.json`,
    `${ROOT}/.claude/tasks/sprints.md`,
  ])
  expect(host.files.get(`${ROOT}/.claude/better-tasks/teammate.md`)).toBe('---\nreplace: true\n---\nBe brief.')
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

  await clock.advance(32 * 60_000)
  expect(await status()).toBe('auth · idle · context 10 % · cache warm 9m · expires soon') // inside one status check's gap

  await clock.advance(10 * 60_000)
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
  expect(host.spawned.at(-1)).toContain("Given a predecessor's transcript? Search it")
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
  expect(statusPrompts(host)[0]).toMatch(/^better-tasks status check: no activity for 10 min\. Move the work forward: /)
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

test('startup asks once per project about before/after videos; the answer goes in its config.json; Enable sets up the voice', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  let asked = 0
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const question = (e as { questions: { question: string }[] }).questions[0]?.question
    if (question !== QUESTION) return { result: { answers: {} } } // the other startup questions: dismissed
    asked += 1
    return { result: { answers: { [QUESTION]: ENABLE_OPTION } } }
  })
  const host = fakeHost(on)
  host.spawnOutput = 'ready /home/.local/share/better-tasks/kokoro\n'
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(asked).toBe(1)
  expect(JSON.parse(host.files.get(`${TASKS}/config.json`) ?? '{}')).toEqual({ demoVideos: true })
  expect(host.spawnedArgv.some(argv => argv.at(-1)?.endsWith('/bin/kokoro-setup.sh'))).toBe(true)
  expect(host.toasts).toContain('Kokoro voice ready: before/after videos are on.')

  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(asked).toBe(1)

  host.files.delete(`${TASKS}/config.json`) // another project, same machine: asked at its own first start
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(asked).toBe(2)
})

test('with before/after videos on, teammates get the pointer to the video skill', { options: { demoVideos: true } }, async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const teams = { env: { ...TEAMS_ON, HOME: '/home' }, settingsEnv: TEAMS_ON }
  const host = fakeHost(on, [], { '/home/.local/share/better-tasks/kokoro/.ready': '' }, teams)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'p', name: 'auth' })
  expect(host.spawned[0]).toContain('Record the before/after video (`better-tasks:video`)')
  const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], outputStyle: null, tools: ['Agent'], traits: [] })
  expect(composed.sections.at(-1)?.text).toContain('the video is the functional test')
  expect(host.toasts).toEqual([])
})

test('at the team size limit a new spawn is refused, naming the team and what each owns; a stopped teammate frees a place', { options: { maxTeammates: 2 } }, async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const team = [mate('a1', 'cart'), { ...mate('a2', 'login'), status: 'idle' as const }]
  const host = fakeHost(on, team)
  await $.session.start(SESSION)
  const make = (title: string) => $.tool.call({ ...create, title } as never)
  const own = (id: string, status: string) => $.tool.call({ tool: 'mcp__better-tasks__task_update', tool_use_id: 'u', id, owner: 'cart', status } as never)
  await make('Cart total')
  await make('Cart badge')
  await own('T-001', 'todo')
  await own('T-002', 'doing')
  const refused = await $.tool.call({ tool: 'Agent', tool_use_id: 'a3', description: 'd', prompt: 'p', name: 'footer' })
  expect(refused).toEqual({ deny: 'The team is at its limit of 2 teammates (cart T-002 T-001, login). Give the task to the owner of similar work, queued after its current one (task_update owner, then SendMessage), or wait until one finishes.' })
  expect(host.spawned).toEqual([])
  const status = String((await $.tool.call({ tool: 'mcp__better-tasks__team_status', tool_use_id: 'ts' })).result)
  expect(status).toContain('cart · idle · context ? · T-002 Cart badge, T-001 Cart total') // its current task first
  team[1] = { ...team[1]!, status: 'completed' }
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a4', description: 'd', prompt: 'p', name: 'footer' })
  expect(host.spawned).toHaveLength(1)
})

test('with PR per task on, every named teammate gets its own worktree and the PR rules; the lead merges on approval', { options: { pullRequests: true } }, async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))
  await $.session.start(SESSION)
  const named = await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'p', name: 'auth' })
  expect(named.result).toEqual({ isolation: 'none' })
  expect(host.spawned[0]).toContain("Your own worktree `/project/.claude/worktrees/auth`, on branch `worktree-auth`, and a PR that merges into main")
  const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], outputStyle: null, tools: ['Agent'], traits: [] })
  expect(composed.sections.at(-1)?.text).toContain('Merge with `gh pr merge --squash`')
  expect(composed.sections.at(-1)?.text).toContain('the full tests, then its PR')
})

test('with PR per task on and gh too old or missing, startup updates gh and says how it went', { options: { pullRequests: true } }, async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on) // its gh --version prints nothing: gh missing
  host.spawnOutput = 'ready gh version 2.102.0 (2026-09-30)\n'
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(host.spawnedArgv.filter(argv => argv.at(-1)?.endsWith('/bin/gh-update.sh'))).toHaveLength(1)
  expect(host.toasts).toContain('GitHub CLI updated (2.102.0): PRs carry their video.')
})

/** The setup questions a test about other questions leaves alone (dismissed: asked again next time). */
const isOtherSetupQuestion = (question: string) =>
  question === TEAM_QUESTION

/** Answers each setup question from `answers` (by question), dismisses the rest; returns the questions asked, in order. */
function answerSetup(on: On, answers: Record<string, string>): string[] {
  const asked: string[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const question = (e as { questions: { question: string }[] }).questions[0]?.question ?? ''
    asked.push(question)
    return { result: { answers: question in answers ? { [question]: answers[question] } : {} } }
  })
  return asked
}

test('"useBetterTasks": false in config.json: better-tasks stays quiet (no questions, no tools, no rules)', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const asked = answerSetup(on, {})
  const host = fakeHost(on, [], { [`${TASKS}/config.json`]: '{ "useBetterTasks": false }' })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(asked).toEqual([])
  expect(host.registered.every(name => name.startsWith('/'))).toBe(true) // commands only: /better-tasks config still opens
  expect(host.notices.at(-1)).toContain('better-tasks is off in this project')
  const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], outputStyle: null, tools: ['Agent'], traits: [] })
  expect(composed.sections).toEqual([{ id: 'intro', text: 'You are Claude.', scope: 'shared' }])
})

test('no task files question: the tasks stay in git, .gitignore untouched', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const asked = answerSetup(on, { [TEAM_QUESTION]: TEAM_NO })
  const host = fakeHost(on, [], { [`${ROOT}/.gitignore`]: 'node_modules/' })
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(asked[0]).toBe(TEAM_QUESTION)
  expect(asked.some(question => question.includes('task files'))).toBe(false)
  expect(host.files.get(`${ROOT}/.gitignore`)).toBe('node_modules/')
})

/** Answers the "who gets better-tasks" question with `answer`, dismisses the rest; returns how often it was asked. */
function answerTeam(on: On, answer: string): { asked: number } {
  const count = { asked: 0 }
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const question = (e as { questions: { question: string }[] }).questions[0]?.question ?? ''
    if (question !== TEAM_QUESTION) return { result: { answers: {} } }
    count.asked += 1
    return { result: { answers: { [question]: answer } } }
  })
  return count
}

test('"Everyone on this project": better-tasks goes in the shared .claude/settings.json, committed alone; not asked again', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const team = answerTeam(on, TEAM_YES)
  const host = fakeHost(on, [], { [`${ROOT}/.claude/settings.json`]: JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } }) })
  host.runOutput[LS_REMOTE] = RELEASES
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(team.asked).toBe(1)
  expect(JSON.parse(host.files.get(`${ROOT}/.claude/settings.json`) ?? '')).toEqual({
    permissions: { allow: ['Bash(npm test)'] },
    extraKnownMarketplaces: { 'better-tasks': { source: { source: 'github', repo: 'iosifnicolae2/better-tasks', ref: 'v0.10.8' } } },
    enabledPlugins: { 'better-tasks@better-tasks': true },
  })
  expect(host.ran).toContain(`git -C ${ROOT} add -- .claude/settings.json`)
  expect(host.ran).toContain(`git -C ${ROOT} commit --quiet -m ${TEAM_COMMIT} --only -- .claude/settings.json`)
  expect(JSON.parse(host.files.get(`${TASKS}/config.json`) ?? '')).toEqual({ shareWithTeam: true })

  host.files.delete(`${TASKS}/config.json`) // a teammate's checkout: better-tasks is in the shared settings already
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(team.asked).toBe(1)
})

const LS_REMOTE = 'git ls-remote --tags --refs -- https://github.com/iosifnicolae2/better-tasks.git'
const RELEASES = 'a\trefs/tags/v0.10.7\nb\trefs/tags/v0.10.8'
const SHARED = `${ROOT}/.claude/settings.json`
/** The plugin under test runs from this checkout: its own folder, as Claude Code lists an install. */
const PLUGIN_ROOT = new URL('..', (import.meta as unknown as { url: string }).url).pathname.replace(/\/$/, '')
const unpinned = (marketplace: object) => JSON.stringify({ extraKnownMarketplaces: { 'better-tasks': marketplace }, enabledPlugins: { 'better-tasks@better-tasks': true } })
const marketplaceIn = (host: Host) => JSON.parse(host.files.get(SHARED) ?? '').extraKnownMarketplaces['better-tasks']

/** Claude Code's plugin commands: `claude plugin list` shows `installed` at the plugin's own folder; `claude plugin update` installs `next`. */
function fakePluginCli(host: Host, installed: string, next: string): void {
  host.answerRun = argv => {
    if (argv[0] !== 'claude') return undefined
    if (argv[2] === 'update') installed = next
    const list = [{ id: 'better-tasks@better-tasks', version: installed, scope: 'user', installPath: PLUGIN_ROOT }]
    return argv[2] === 'list' ? JSON.stringify(list) : ''
  }
}

test('shared unpinned with auto-update: pinned to the installed release and committed, without asking', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const team = answerTeam(on, TEAM_YES)
  const host = fakeHost(on, [], { [SHARED]: unpinned({ source: { source: 'github', repo: 'iosifnicolae2/better-tasks' }, autoUpdate: true }) })
  fakePluginCli(host, '0.10.7', '0.10.7')
  host.runOutput[LS_REMOTE] = RELEASES
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(team.asked).toBe(0)
  expect(marketplaceIn(host)).toEqual({ source: { source: 'github', repo: 'iosifnicolae2/better-tasks', ref: 'v0.10.7' } })
  expect(host.ran).toContain(`git -C ${ROOT} commit --quiet -m ${pinCommit('v0.10.7')} --only -- .claude/settings.json`)
  expect(host.notices).toContain('better-tasks: pinned to v0.10.7 in .claude/settings.json, no auto-update (it took every new release unchecked). Committed; push it for your teammates.')
})

test('a worktree per task: the pin is written but left for the user to commit', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  answerTeam(on, TEAM_YES)
  const host = fakeHost(on, [], {
    [SHARED]: unpinned({ source: { source: 'github', repo: 'iosifnicolae2/better-tasks' } }),
    [`${TASKS}/config.json`]: '{ "gitFlow": "worktree-prs" }',
  })
  fakePluginCli(host, '0.10.7', '0.10.7')
  host.runOutput[LS_REMOTE] = RELEASES
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(marketplaceIn(host).source.ref).toBe('v0.10.7')
  expect(host.ran.some(command => command.includes(' commit '))).toBe(false)
  expect(host.notices.some(line => line.startsWith('better-tasks: pinned to v0.10.7') && line.endsWith('Commit it yourself.'))).toBe(true)
})

test('a newer release: asked once; Yes moves the pin, updates the plugin, asks to restart', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const asked = answerSetup(on, { [updateQuestion('v0.10.8')]: 'Yes', [restartQuestion('v0.10.8')]: RESTART_LATER })
  const host = fakeHost(on, [], { [SHARED]: unpinned({ source: { source: 'github', repo: 'iosifnicolae2/better-tasks', ref: 'v0.10.7' } }) })
  fakePluginCli(host, '0.10.7', '0.10.8')
  host.runOutput[LS_REMOTE] = RELEASES
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(asked[0]).toBe(updateQuestion('v0.10.8'))
  expect(host.ran).toContain('claude plugin marketplace add --scope project -- iosifnicolae2/better-tasks#v0.10.8')
  expect(host.ran).toContain('claude plugin update --scope user -- better-tasks@better-tasks')
  expect(host.ran).toContain(`git -C ${ROOT} commit --quiet -m ${updateCommit('v0.10.8')} --only -- .claude/settings.json`)
  expect(host.notices).toContain('better-tasks: updated to v0.10.8. .claude/settings.json now pins v0.10.8. Committed; push it for your teammates.')
  await clock.advance(QUIET_PROMPT_BOX)
  expect(asked[1]).toBe(restartQuestion('v0.10.8'))
  expect(host.notices).toContain(restartLaterLine('v0.10.8'))
})

test('a pin already at the release (a teammate pulled the bump): the install catches up, nothing to commit', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  answerSetup(on, { [updateQuestion('v0.10.8')]: 'Yes' })
  const host = fakeHost(on, [], { [SHARED]: unpinned({ source: { source: 'github', repo: 'iosifnicolae2/better-tasks', ref: 'v0.10.8' } }) })
  fakePluginCli(host, '0.10.7', '0.10.8')
  host.runOutput[LS_REMOTE] = RELEASES
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(host.ran).toContain('claude plugin update --scope user -- better-tasks@better-tasks')
  expect(host.ran.some(command => command.includes(' commit '))).toBe(false)
  expect(host.notices).toContain('better-tasks: updated to v0.10.8.')
})

test('a newer release, No: not asked again for that release', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  const store = new Map<string, unknown>()
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  const asked = answerSetup(on, { [updateQuestion('v0.10.8')]: 'No' })
  const host = fakeHost(on)
  fakePluginCli(host, '0.10.7', '0.10.8')
  host.runOutput[LS_REMOTE] = RELEASES
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(asked.filter(question => question === updateQuestion('v0.10.8')).length).toBe(1)
  expect(store.get(DECLINED_KEY)).toBe('v0.10.8')
  expect(host.ran.some(command => command.startsWith('claude plugin update'))).toBe(false)
})

test('a linked install (the user\'s own checkout): no update question', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const asked = answerSetup(on, {})
  const host = fakeHost(on)
  host.runOutput[LS_REMOTE] = RELEASES
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(asked.some(question => question.includes('is out'))).toBe(false)
})

test('"Only me": nothing in the project changes, the answer is saved, and it is not asked again', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const team = answerTeam(on, TEAM_NO)
  const host = fakeHost(on)
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(team.asked).toBe(1)
  expect(host.files.has(`${ROOT}/.claude/settings.json`)).toBe(false)
  expect(JSON.parse(host.files.get(`${TASKS}/config.json`) ?? '')).toEqual({ shareWithTeam: false })
})

test('in a GitHub project startup asks about videos, then the git flow; the flow is saved in config.json and set up', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const asked: { question: string; options: string[] }[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const first = (e as { questions: { question: string; options: { label: string }[] }[] }).questions[0]
    const question = first?.question ?? ''
    const options = (first?.options ?? []).map(option => option.label)
    if (isOtherSetupQuestion(question)) return { result: { answers: {} } } // dismissed: their own tests
    asked.push({ question, options })
    return { result: { answers: { [question]: question === QUESTION ? 'No' : options[0] } } }
  })
  const host = fakeHost(on, [], { [`${ROOT}/app/pubspec.yaml`]: '', [`${ROOT}/.claude/tasks/config.json`]: '{ "//": "notes", "// gitFlow": "direct" }' })
  host.runOutput['git remote -v'] = 'origin\tgit@github.com:someone/app.git (fetch)\n'
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(asked.map(one => one.question)).toEqual([QUESTION, expect.stringContaining('Recommended here: Shared dev branch, PR per task (a Flutter app to build and install once for every change).')])
  expect(asked[1]?.options.slice(0, 3)).toEqual(['Shared dev branch, PR per task (Recommended)', 'Worktree and PR per task', 'Straight to main'])
  expect(JSON.parse(host.files.get(`${ROOT}/.claude/tasks/config.json`) ?? '')).toEqual({ '//': 'notes', demoVideos: false, gitFlow: 'dev-prs' })
  expect(host.notices).toContain('better-tasks: made the dev branch here, from this commit: teammates land on it, PRs go to main')
  expect(host.spawnedArgv.map(argv => argv.at(-1)?.split('/').pop())).toEqual(['gh-update.sh']) // gh --version printed nothing: gh missing

  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(asked.filter(one => one.question !== QUESTION)).toHaveLength(1)
})

test('without a GitHub remote startup does not ask for the git flow, and asks in a later GitHub project', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const asked: string[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const question = (e as { questions: { question: string }[] }).questions[0]?.question ?? ''
    if (isOtherSetupQuestion(question)) return { result: { answers: {} } }
    asked.push(question)
    return { result: { answers: { [question]: 'No' } } }
  })
  const host = fakeHost(on)
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(asked).toEqual([QUESTION])
  host.runOutput['git remote -v'] = 'origin\thttps://github.com/someone/app.git (fetch)\n'
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(asked).toEqual([QUESTION, expect.stringContaining('Recommended here: Worktree and PR per task (a copy is cheap to set up).')])
  expect(JSON.parse(host.files.get(`${ROOT}/.claude/tasks/config.json`) ?? '')).toEqual({ demoVideos: false }) // "No" names no flow: asked again next time
})

test('a setup question waits while the user types a prompt, and asks once the prompt box stays empty', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const asked: string[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    asked.push((e as { questions: { question: string }[] }).questions[0]?.question ?? '')
    return { result: { answers: {} } }
  })
  const host = fakeHost(on)
  host.composer = 'fix the login bu'
  await $.session.start(SESSION)
  await clock.advance(30_000)
  expect(asked).toEqual([])
  host.composer = ''
  await clock.advance(1000)
  expect(asked).toEqual([])
  await clock.advance(QUIET_PROMPT_BOX)
  expect(asked).toContain(QUESTION)
})

test('the recommended option comes first, and a dismissed setup question saves nothing and comes back next session', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const asked: string[][] = []
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const first = (e as { questions: { question: string; options: { label: string }[] }[] }).questions[0]
    if (first?.question === QUESTION) asked.push((first?.options ?? []).map(option => option.label))
    return { result: { answers: {} } }
  })
  const host = fakeHost(on)
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(asked).toEqual([[ENABLE_OPTION, 'No']])
  expect(JSON.parse(host.files.get(`${TASKS}/config.json`) ?? '{}')).not.toHaveProperty('demoVideos')
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(asked).toHaveLength(2)
})

test('off-screen is on by default and never asked; the rules follow', async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const asked: string[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    asked.push((e as { questions: { question: string }[] }).questions[0]?.question ?? '')
    return { result: { answers: {} } }
  })
  const host = fakeHost(on, [], {}, { env: TEAMS_ON, settingsEnv: TEAMS_ON })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))
  await $.session.start(SESSION)
  await clock.advance(QUIET_PROMPT_BOX)
  expect(asked.some(question => /off-screen|background/i.test(question))).toBe(false)

  await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'p', name: 'auth' })
  expect(host.spawned[0]).toContain('`better-tasks:testing`')
  const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], outputStyle: null, tools: ['Agent'], traits: [] })
  expect(composed.sections.at(-1)?.text).toContain('Teammates test off the user\'s screen;')
})

test('a worktree and a PR per task, the default with a GitHub remote: a named teammate gets its own worktree', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  host.runOutput['git remote -v'] = 'origin\thttps://github.com/someone/app.git (fetch)\n'
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))
  await $.session.start(SESSION)
  const named = await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'p', name: 'auth' })
  expect(named.result).toEqual({ isolation: 'none' })
  expect(host.ran).toContain(`git -C ${ROOT} worktree add ${ROOT}/.claude/worktrees/auth worktree-auth`)
  const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], outputStyle: null, tools: ['Agent'], traits: [] })
  expect(composed.sections.at(-1)?.text).toContain('## Git flow\nA worktree and a PR per task.')
})

test('straight to main, the default without a GitHub remote: one checkout, and teammates commit only their own paths with land.sh', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))
  await $.session.start(SESSION)
  const named = await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'p', name: 'auth' })
  expect(named.result).toEqual({ isolation: 'none' })
  expect(host.spawned[0]).toMatch(/on main\. Commit only your own files with `\S+\/bin\/land\.sh` \(--help\)/)
  const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], outputStyle: null, tools: ['Agent'], traits: [] })
  expect(composed.sections.at(-1)?.text).toContain("a task's PR is a draft for review that never merges")
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a2', description: 'd', prompt: 'p', name: 'bug', isolation: 'worktree' })
  expect(host.spawned[1]).toContain('Your own worktree `/project/.claude/worktrees/bug`')
})

test('the shared dev branch flow: no worktree, land on dev, the PR from the pull-request skill; the lead merges and syncs dev', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [], { [`${ROOT}/.claude/tasks/config.json`]: JSON.stringify({ gitFlow: 'dev-prs', devBranch: 'develop' }) })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))
  on('skill.prompt', ($, e) => ({ text: e.text }))
  await $.session.start(SESSION)
  const named = await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'p', name: 'auth' })
  expect(named.result).toEqual({ isolation: 'none' })
  expect(host.spawned[0]).toContain('on `develop`. Commit only your own files')
  const skill = (await $.skill.prompt({ skill: 'better-tasks:pull-request', text: '# PR' })).text
  expect(skill).toContain('task_pr.py open <id> --body-file')
  expect(skill).not.toContain('--here')
  const lead = (await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], outputStyle: null, tools: ['Agent'], traits: [] })).sections.at(-1)?.text ?? ''
  expect(lead).toContain('Shared `develop` branch')
  expect(lead).toContain('/bin/task_pr.py sync')
})

test('the old overrides and the "instructions" setting move to .claude/better-tasks/ once, and reach the prompts', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [], {
    [`${ROOT}/.claude/tasks/config.json`]: JSON.stringify({ instructions: 'docs/workflow.md, docs/rules/', taskPrefix: 'BUG-' }),
    [`${ROOT}/.claude/tasks/coordinator.md`]: '<!-- extend -->\nAsk before big refactors.',
  })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))
  await $.session.start(SESSION)
  expect(host.files.has(`${ROOT}/.claude/tasks/coordinator.md`)).toBe(false)
  expect(host.files.get(`${ROOT}/.claude/better-tasks/lead.md`)).toBe('Ask before big refactors.\n\n## Project rules\nRead before you work: docs/workflow.md, docs/rules/.\n')
  expect(JSON.parse(host.files.get(`${ROOT}/.claude/tasks/config.json`) ?? '{}')).toEqual({ taskPrefix: 'BUG-' })
  expect(host.notices.some(line => line.startsWith('better-tasks: moved coordinator.md → .claude/better-tasks/lead.md'))).toBe(true)
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'p', name: 'auth' })
  expect(host.spawned[0]).toContain('## Project rules\nRead before you work: docs/workflow.md, docs/rules/.')
  const lead = (await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], outputStyle: null, tools: ['Agent'], traits: [] })).sections.at(-1)?.text ?? ''
  expect(lead).toContain('Ask before big refactors.')
  expect(lead).toContain('Read before you work: docs/workflow.md')
})

// ---- Teammate models: Opus at low, medium and high effort for easy, normal and hard tasks (models.ts) ----

const AS_SET = (name: string, model: string, effort: string) => ({ name, model, effort })
const DEFAULT_TYPES = [AS_SET('teammate-easy', 'opus', 'low'), AS_SET('teammate-normal', 'opus', 'medium'), AS_SET('teammate-hard', 'opus', 'high')]

test('at start the three teammate agent types are registered with the settings, so a spawn sets model and effort', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  await $.session.start(SESSION)
  expect(host.agentTypes).toEqual(DEFAULT_TYPES)
})

test('the teammate types leave permission asks with the user: permissionMode default, no hooks', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  await $.session.start(SESSION)
  expect(host.agentModes).toEqual(['default', 'default', 'default'])
})

test('the plugin options and the project config.json choose the models and efforts', { options: { easyModel: 'haiku', hardEffort: 'max' } }, async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on, [], { [`${ROOT}/.claude/tasks/config.json`]: JSON.stringify({ hardModel: 'fable', normalEffort: 'high' }) })
  await $.session.start(SESSION)
  expect(host.agentTypes).toEqual([AS_SET('teammate-easy', 'haiku', 'low'), AS_SET('teammate-normal', 'opus', 'high'), AS_SET('teammate-hard', 'fable', 'max')])
})

test('a setting changed mid-session registers the types again at the next message, and only then', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  await $.session.start(SESSION)
  await $.prompt.submit(prompt('hello'))
  expect(host.agentTypes).toHaveLength(3)
  host.files.set(`${ROOT}/.claude/tasks/config.json`, JSON.stringify({ hardEffort: 'xhigh' }))
  await $.prompt.submit(prompt('hello again'))
  expect(host.agentTypes.slice(3)).toEqual([AS_SET('teammate-easy', 'opus', 'low'), AS_SET('teammate-normal', 'opus', 'medium'), AS_SET('teammate-hard', 'opus', 'xhigh')])
})

test('the lead is told which type to spawn for easy, normal, hard and stuck work, from the settings', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  fakeHost(on)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))
  await $.session.start(SESSION)
  const composed = await $.prompt.compose({ ...COMPOSE_BASE })
  const lead = composed.sections.at(-1)?.text ?? ''
  expect(lead).toContain('`better-tasks:teammate-easy` (opus at low effort)')
  expect(lead).toContain('`better-tasks:teammate-normal` (opus at medium effort)')
  expect(lead).toContain('`better-tasks:teammate-hard` (opus at high effort)')
  expect(lead).toContain('goes a level up')
})

test('with escalation off the lead is told a successor keeps its predecessor’s type', { options: { escalate: false } }, async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  fakeHost(on)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))
  await $.session.start(SESSION)
  const lead = (await $.prompt.compose({ ...COMPOSE_BASE })).sections.at(-1)?.text ?? ''
  expect(lead).toContain("A successor keeps its predecessor's level.")
  expect(lead).not.toContain('a level up')
})

test('a named teammate gets the normal type unless the lead chose one; a scout is left alone', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'p', name: 'auth' })
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a2', description: 'd', prompt: 'p', name: 'auth-2', subagent_type: 'better-tasks:teammate-hard' })
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a3', description: 'd', prompt: 'p', name: 'ci', subagent_type: 'task-teammate' })
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a4', description: 'd', prompt: 'p' })
  expect(host.subagentTypes).toEqual(['better-tasks:teammate-normal', 'better-tasks:teammate-hard', 'task-teammate', undefined])
})

test('a teammate below the hard level is told to report being stuck, while escalation is on', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'p', name: 'auth' })
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a2', description: 'd', prompt: 'p', name: 'auth-2', subagent_type: 'better-tasks:teammate-easy' })
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a3', description: 'd', prompt: 'p', name: 'auth-3', subagent_type: 'better-tasks:teammate-hard' })
  expect(host.spawned[0]).toContain('Not getting there?')
  expect(host.spawned[1]).toContain('Not getting there?')
  expect(host.spawned[2]).not.toContain('Not getting there')
})

test('with escalation off a teammate is not asked to report being stuck', { options: { escalate: false } }, async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'p', name: 'auth' })
  expect(host.spawned[0]).not.toContain('Not getting there')
})

test('if the types cannot be registered, nothing points at them: no rules, no rewritten spawn, one log line', async ($, on) => {
  mock.clock(on, { now: MONDAY_OCT_5 })
  mock.store(on)
  const host = fakeHost(on)
  host.agentDeny = 'not now'
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))
  await $.session.start(SESSION)
  expect(host.notices.filter(line => line.includes('the teammate agent types failed'))).toHaveLength(1)
  const lead = (await $.prompt.compose({ ...COMPOSE_BASE })).sections.at(-1)?.text ?? ''
  expect(lead).not.toContain('Teammate models')
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'd', prompt: 'p', name: 'auth' })
  expect(host.subagentTypes).toEqual([undefined])
  expect(host.spawned[0]).not.toContain('## Stuck?')
})
