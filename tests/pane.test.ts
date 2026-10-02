import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { openCommand } from '../hooks/pane'

const ROOT = '/project'
const DIR = `${ROOT}/.claude/manager/tasks`
const WEDNESDAY = new Date(2026, 9, 7, 12).getTime()

const PANE = {
  component: 'Pane',
  requestId: 'supermanager-tasks',
  props: {
    title: 'Tasks',
    isFocused: true,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

function taskFile(id: string, title: string, sprint: string, status: string, owner = '', rolled = 0): string {
  return [
    '---',
    `id: ${id}`,
    `title: ${title}`,
    `sprint: ${sprint}`,
    'urgent: false',
    `status: ${status}`,
    `owner: ${owner}`,
    `rolled: ${rolled}`,
    'created: 2026-10-03',
    '---',
    '## Goal\nIt works.\n\n## Notes\n',
  ].join('\n')
}

/** A project of three tasks on disk, and a record of every command run. */
function fakeProject(on: On) {
  const files = new Map<string, string>([
    [`${DIR}/T-001-fix-login.md`, taskFile('T-001', 'Fix login', '2026-10-05', 'todo', 'auth', 1)],
    [`${DIR}/T-002-dark-mode.md`, taskFile('T-002', 'Dark mode', 'backlog', 'todo')],
    [`${DIR}/T-003-old-bug.md`, taskFile('T-003', 'Old bug', '2026-10-05', 'done')],
  ])
  const commands: string[][] = []
  mock.clock(on, { now: WEDNESDAY })
  on('session.root', () => ({ value: ROOT }))
  on('session.id', () => ({ value: 'test-session' }))
  on('fs.list', ($, e) => ({
    value: [...files.keys()]
      .filter(path => path.startsWith(`${e.path}/`))
      .map(path => ({ name: path.slice(e.path.length + 1), kind: 'file' as const, size: 0, mtimeMs: 0, isLink: false })),
  }))
  on('fs.read', ($, e) => {
    const text = files.get(e.path)
    return text === undefined ? { deny: `no such file: ${e.path}` } : { value: text }
  })
  on('fs.write', ($, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('process.run', ($, e) => {
    commands.push([...e.argv])
    return { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  return { files, commands }
}

test('the editor setting picks the command', () => {
  expect(openCommand('default', '/a.md', false)).toEqual(['open', '/a.md'])
  expect(openCommand('code', '/a.md', false)).toEqual(['code', '/a.md'])
  expect(openCommand('idea', '/a.md', true)).toEqual(['idea', '/a.md'])
  expect(openCommand('idea', '/a.md', false)).toEqual(['open', '-a', 'IntelliJ IDEA', '/a.md'])
  expect(openCommand('zed', '/a.md', false)).toEqual(['zed', '/a.md'])
})

test('the pane lists the sprint, opens a task and finishes it', { options: { editor: 'idea' } }, async ($, on) => {
  const { files, commands } = fakeProject(on)
  await $.command.run({
    command: 'tasks',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'supermanager', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: 'Sprint 41 · Oct 5–11' })).toBeDefined()
    expect(await ui.find({ key: 'row-T-001' })).toBeDefined()
    expect(await ui.find({ key: 'row-T-002' })).toBeDefined()
    expect(await ui.find({ key: 'row-T-003' })).toBeUndefined()
    expect(await ui.find({ key: 'open' })).toBeUndefined()

    await ui.press({ key: 'row-T-001' })
    commands.length = 0
    await ui.press({ key: 'open' })
    expect(commands).toEqual([
      ['which', 'idea'],
      ['open', '-a', 'IntelliJ IDEA', `${DIR}/T-001-fix-login.md`],
    ])
    await ui.press({ key: 'row-T-001' })
    await ui.unmount()
  }

  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'terminal', ...PANE })
  await ui.press({ key: 'row-T-001' })
  await ui.press({ key: 'done' })
  expect(files.get(`${DIR}/T-001-fix-login.md`)).toContain('status: done')
  expect(await ui.find({ key: 'row-T-001' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '2/2 done' })).toBeDefined()
})

test('moving a task puts it in the next sprint', async ($, on) => {
  const { files } = fakeProject(on)
  await $.command.run({
    command: 'tasks',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'desktop', ...PANE })
  await ui.press({ key: 'row-T-002' })
  await ui.select({ key: 'move', value: 'next-sprint' })
  expect(files.get(`${DIR}/T-002-dark-mode.md`)).toContain('sprint: 2026-10-12')
})

test('the config row writes the settings', async ($, on) => {
  fakeProject(on)
  const writes: unknown[] = []
  on('config.set', ($, e) => {
    writes.push([e.key, e.value])
    return { value: e.value }
  })
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'terminal', ...PANE })
  await ui.select({ key: 'editor', value: 'code' })
  await ui.select({ key: 'worktree', value: 'on' })
  await ui.select({ key: 'limit', value: '60' })
  expect(writes).toEqual([
    ['supermanager.editor', 'code'],
    ['supermanager.worktree', true],
    ['supermanager.contextLimit', 60],
  ])
})

test('the phone draws the list without pickers', async ($, on) => {
  fakeProject(on)
  await $.command.run({
    command: 'tasks',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 60 },
  })
  const ui = await $.ui.mount({ plugin: 'supermanager', surface: 'mobile', ...PANE })
  await ui.press({ key: 'row-T-001' })
  expect(await ui.find({ key: 'done' })).toBeDefined()
  expect(await ui.find({ key: 'editor' })).toBeUndefined()
})
