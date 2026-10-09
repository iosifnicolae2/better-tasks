// Named without .test so the suite skips it: scripts/instructions-doc.ts copies it into a scratch plugin, next to the inputs.ts it writes,
// and runs it with `claude plugin test`. It starts a session on a fake engine and prints, as one JSON line,
// every text better-tasks puts in front of the model: the lead's rules, a teammate's prompt, the context on
// each user message, the agent types, tools, commands and the skills as they load.
import { mock, test } from 'claude-code/testing'

import { CONFIG, OPTIONS, SKILLS } from './inputs'
import { TEMPLATES } from './templates.gen'

const ROOT = '/project'
const HOME = '/home/me'
const MONDAY = new Date(2026, 9, 5, 9).getTime()
const TEAMS_ON = { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' }
const TASK = `${ROOT}/.claude/tasks/T-004-fix-login-redirect.md`
const TASK_TEXT = '---\nid: T-004\ntitle: Fix login redirect\nsprint: 2026-10-05\nurgent: true\nstatus: todo\nowner:\nrolled: 0\ncreated: 2026-10-05\n---\n## Goal\nAfter login, land on the page asked for.\n\n## Notes\n'

const MARK = '@@better-tasks-instructions@@'

test('dump every instruction text', { options: OPTIONS }, async ($, on) => {
  const clock = mock.clock(on, { now: MONDAY })
  mock.store(on)
  const files = new Map<string, string>([[`${ROOT}/.claude/tasks/config.json`, JSON.stringify(CONFIG)], [TASK, TASK_TEXT]])
  const env = new Map([...Object.entries(TEAMS_ON), ['HOME', HOME]])
  const out = {
    tools: [] as { name: string; description: string; inputSchema?: unknown }[],
    commands: [] as { name: string; description?: string }[],
    agents: [] as { name: string; description: string; prompt: string; model?: string; effort?: string | number }[],
    pluginPrompts: [] as string[],
    leadSections: [] as { id: string; text: string }[],
    teammate: '',
    context: [] as string[],
    skills: {} as Record<string, string>,
  }

  on('env.get', ($, e) => ({ value: env.get(e.name) }))
  on('env.set', ($, e) => (e.value === undefined ? env.delete(e.name) : env.set(e.name, e.value), { value: undefined }))
  on('settings.read', () => ({ value: { env: TEAMS_ON } }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: ROOT }))
  on('session.id', () => ({ value: 'lead-session' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000, percent: 10 }, rateLimits: [] } }))
  on('agent.list', () => ({ value: [] }))
  on('agent.register', ($, e) => (out.agents.push({ name: e.name, description: e.description, prompt: e.prompt, model: e.model, effort: e.effort }), { value: { agent: `better-tasks:${e.name}` } }))
  on('tool.register', ($, e) => (out.tools.push({ name: e.name, description: e.description, inputSchema: e.inputSchema }), { value: { tool: `mcp__better-tasks__${e.name}` } }))
  on('command.register', ($, e) => (out.commands.push({ name: e.name, description: e.description }), { value: { command: e.name } }))
  const template = (path: string) => (path.startsWith(`${ROOT}/`) ? undefined : TEMPLATES[path.match(/\/\.claude\/better-tasks\/([^/]+)$/)?.[1] ?? ''])
  on('fs.read', ($, e) => {
    const text = files.get(e.path) ?? template(e.path)
    return text === undefined ? { deny: `ENOENT ${e.path}` } : { value: text }
  })
  on('fs.write', ($, e) => (files.set(e.path, e.text), { value: undefined }))
  on('fs.list', ($, e) => {
    const prefix = `${e.path}/`
    const inside = [...files.keys()].filter(path => path.startsWith(prefix)).map(path => path.slice(prefix.length))
    if (inside.length === 0) return { deny: `ENOENT ${e.path}` }
    const names = [...new Set(inside.map(path => path.split('/')[0]!))]
    return { value: names.map(name => ({ name, kind: inside.includes(name) ? ('file' as const) : ('dir' as const), size: 1, mtimeMs: 0, isLink: false })) }
  })
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('process.spawn', async function* () {
    return { value: { code: 0, signal: null } }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: { answers: {} } }))
  on('tool.call', { tool: 'Agent' }, ($, e) => ((out.teammate = e.prompt), { result: { isolation: 'none' } }))
  on('prompt.submit', ($, e) => {
    if (e.origin.kind === 'plugin') out.pluginPrompts.push(e.text)
    return { text: e.text, context: e.context }
  })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: '(Claude Code\'s own system prompt)', scope: 'shared' }] }))
  on('skill.prompt', ($, e) => ({ text: e.text }))

  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], outputStyle: null, tools: ['Agent'], traits: [] })
  out.leadSections = composed.sections.filter(section => section.id !== 'intro').map(section => ({ id: section.id, text: section.text }))
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'T-004 Fix login redirect', prompt: 'Task file: .claude/tasks/T-004-fix-login-redirect.md', name: 'login' })
  const entered = await $.prompt.submit({ text: 'hi', origin: { kind: 'composer' }, wait: false })
  out.context = [...(entered.context ?? [])]
  for (const name of SKILLS) out.skills[name] = (await $.skill.prompt({ skill: `better-tasks:${name}`, text: '' })).text
  await clock.advance(11 * 60_000)
  console.log(MARK + JSON.stringify(out))
})
