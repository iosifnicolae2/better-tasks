import { describe, expect, test } from 'claude-code/testing'

import type { Task } from '../types'
import { openTaskLines } from '../hooks/coordinator'
import { fingerprintOf } from '../hooks/status'
import { startPrompt } from '../hooks/taskflow'
import { groupedByLabel } from '../hooks/board'
import {
  blockersOf,
  byLabel,
  dependencyProblem,
  formatTask,
  isBlocked,
  labelOf,
  labelProblem,
  parseTask,
  taskLine,
  unblockedBy,
  waitsText,
} from '../hooks/tasks'

// Tasks that depend on others, by id or by label: the labels and dependsOn fields, the checks on them,
// what a blocked task shows, and tasks grouped by label.

const CONFIG = { weeks: 1, startDay: 1 } as const
const TODAY = '2026-10-07'

const task = (id: string, fields: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  sprint: '2026-10-05',
  urgent: false,
  status: 'todo',
  owner: '',
  rolled: 0,
  order: 0,
  created: '2026-10-03',
  labels: [],
  dependsOn: [],
  file: `/p/.claude/tasks/${id}.md`,
  body: '## Goal\n\n## Notes\n',
  ...fields,
})

describe('the labels and dependsOn fields', () => {
  test('written as YAML lists after the other fields, and read back', () => {
    const waiting = task('T-003', { labels: ['checkout', 'api'], dependsOn: ['T-001', 'T-002', 'prices'] })
    const text = formatTask(waiting)
    expect(text).toContain('created: 2026-10-03\nlabels: [checkout, api]\ndependsOn: [T-001, T-002, prices]\n---\n')
    expect(parseTask(text, waiting.file)).toEqual(waiting)
  })

  test('a label is stored lower case, dashed, without list or YAML characters', () => {
    expect(labelOf(' Check Out ')).toBe('check-out')
    expect(labelOf('a,[b]: #c')).toBe('ab-c')
    expect(parseTask('---\nid: T-001\nlabels: [Checkout, API]\n---\n', '/f.md').labels).toEqual(['checkout', 'api'])
  })

  test('a label that reads as a task id is refused', () => {
    expect(labelProblem(['checkout', 't-12'], 'T-')).toBe('t-12 reads as a task id: pick another label.')
    expect(labelProblem(['t-shirt'], 'T-')).toBeUndefined()
  })

  test('left out when empty; a hand-written one reads with or without brackets', () => {
    expect(formatTask(task('T-001'))).not.toContain('dependsOn')
    expect(formatTask(task('T-001'))).not.toContain('labels')
    expect(parseTask('---\nid: T-001\n---\n', '/f.md').dependsOn).toEqual([])
    expect(parseTask('---\nid: T-003\ndependsOn: T-001,T-002\n---\n', '/f.md').dependsOn).toEqual(['T-001', 'T-002'])
    expect(parseTask('---\nid: T-003\ndependsOn: ["T-001"]\n---\n', '/f.md').dependsOn).toEqual(['T-001'])
  })
})

describe('checks', () => {
  const tasks = [
    task('T-001', { labels: ['prices'] }),
    task('T-002', { dependsOn: ['T-001'] }),
    task('T-003', { dependsOn: ['T-002'], labels: ['cart'] }),
  ]
  const draft = (fields: Partial<Task>) => task('T-004', fields)
  const cycle = (path: string) => `That makes a cycle, ${path}: drop one of these dependencies or labels.`

  test('existing tasks in any case, several of them, or a label other tasks have: fine', () => {
    expect(dependencyProblem(draft({ dependsOn: ['T-001', 'T-003'] }), tasks)).toBeUndefined()
    expect(dependencyProblem(draft({ dependsOn: ['prices', 'T-002'] }), tasks)).toBeUndefined()
  })

  test('an unknown id or label, a label only the task itself has, or the task itself, is refused', () => {
    const unknown = 'No task or label T-099: dependsOn takes task ids, or labels other tasks have.'
    expect(dependencyProblem(draft({ dependsOn: ['T-001', 'T-099'] }), tasks)).toBe(unknown)
    expect(dependencyProblem(draft({ labels: ['mine'], dependsOn: ['mine'] }), tasks)).toContain('No task or label mine')
    expect(dependencyProblem({ ...tasks[1]!, dependsOn: ['T-002'] }, tasks)).toBe("T-002 can't depend on itself.")
  })

  test('a cycle is refused and named, however long', () => {
    expect(dependencyProblem({ ...tasks[0]!, dependsOn: ['T-002'] }, tasks)).toBe(cycle('T-001 → T-002 → T-001'))
    expect(dependencyProblem({ ...tasks[0]!, dependsOn: ['T-003'] }, tasks)).toBe(cycle('T-001 → T-003 → T-002 → T-001'))
  })

  test('cycles through labels: by depending on a label, or by taking a label others wait on', () => {
    expect(dependencyProblem({ ...tasks[0]!, dependsOn: ['cart'] }, tasks)).toBe(cycle('T-001 → T-003 → T-002 → T-001'))
    const waitsOnPrices = [...tasks, task('T-005', { dependsOn: ['prices'] })]
    expect(dependencyProblem({ ...waitsOnPrices[1]!, labels: ['prices'], dependsOn: ['T-005'] }, waitsOnPrices)).toBe(cycle('T-002 → T-005 → T-002'))
  })

  test('two tasks with a label, each waiting on that label, wait on each other', () => {
    const one = task('T-006', { labels: ['ui'], dependsOn: ['ui'] })
    expect(dependencyProblem(draft({ labels: ['ui'], dependsOn: ['ui'] }), [...tasks, one])).toBe(cycle('T-004 → T-006 → T-004'))
  })
})

describe('the blocked state', () => {
  const prices = task('T-001', { status: 'doing', body: '## Notes\n- PR: https://github.com/acme/shop/pull/39\n' })
  const cart = task('T-003', { dependsOn: ['T-001', 'T-002'] })

  test('a task waits on its open dependencies; done, cancelled or deleted ones no longer hold it', () => {
    const api = task('T-002')
    expect(blockersOf(cart, [prices, api, cart]).map(one => one.id)).toEqual(['T-001', 'T-002'])
    expect(waitsText(cart, [prices, api, cart])).toBe('waits on T-001 (#39), T-002')
    expect(isBlocked(cart, [{ ...prices, status: 'done' }, { ...api, status: 'cancelled' }, cart])).toBe(false)
    expect(isBlocked(cart, [cart])).toBe(false)
  })

  test('a label dependency waits on every other open task with that label', () => {
    const prices = [task('T-004', { labels: ['prices'], status: 'doing' }), task('T-005', { labels: ['prices'] }), task('T-006', { labels: ['prices'], status: 'done' })]
    const total = task('T-007', { labels: ['prices'], dependsOn: ['prices', 'T-001'] })
    const tasks = [...prices, total, { ...task('T-001'), status: 'done' as const }]
    expect(blockersOf(total, tasks).map(one => one.id)).toEqual(['T-004', 'T-005'])
    expect(waitsText(total, tasks)).toBe('waits on label prices (T-004, T-005)')
    const closed = { ...prices[0]!, status: 'done' as const }
    expect(unblockedBy(closed, [closed, prices[1]!, total])).toEqual([])
    const last = { ...prices[1]!, status: 'done' as const }
    expect(unblockedBy(last, [closed, last, total]).map(one => one.id)).toEqual(['T-007'])
  })

  test('closing a dependency unblocks the tasks that waited only on it', () => {
    const other = task('T-004', { dependsOn: ['T-001'] })
    const closed = { ...prices, status: 'done' as const }
    expect(unblockedBy(closed, [closed, task('T-002'), cart, other]).map(one => one.id)).toEqual(['T-004'])
  })

  test('task_list lines and the open tasks in the lead context say what a task waits on', () => {
    const tasks = [prices, cart]
    expect(taskLine(cart, TODAY, CONFIG, tasks)).toBe('T-003 [todo] Task T-003 · this sprint · waits on T-001 (#39)')
    expect(taskLine({ ...cart, status: 'done' }, TODAY, CONFIG, tasks)).toBe('T-003 [done] Task T-003 · this sprint')
    expect(openTaskLines(tasks, TODAY, CONFIG)).toContain('- T-003 Task T-003 · this sprint · waits on T-001 (#39)')
  })

  test('a blocked task started from the board names what it waits on', () => {
    expect(startPrompt(cart, [prices, cart])).toContain('Start T-003 "Task T-003" now (it waits on T-001 (#39); the user starts it anyway).')
    expect(startPrompt(prices, [prices, cart])).toContain('Start T-001 "Task T-001" now. Route it')
  })

  test('task_list lines name the labels', () => {
    expect(taskLine({ ...cart, labels: ['checkout'] }, TODAY, CONFIG, [cart])).toBe('T-003 [todo] Task T-003 · this sprint · labels checkout')
  })

  test('a changed dependency list is news for the status check', () => {
    expect(fingerprintOf([cart], [])).not.toBe(fingerprintOf([{ ...cart, dependsOn: [] }], []))
  })
})

describe('grouped by label', () => {
  const tasks = [task('T-001', { labels: ['ui'] }), task('T-002'), task('T-003', { labels: ['api', 'ui'] }), task('T-004', { labels: ['api'] })]

  test('task_list: each label A to Z, a task under each of its labels, the ones with none last', () => {
    const groups = [...byLabel(tasks)].map(([label, some]) => [label, some.map(one => one.id)])
    expect(groups).toEqual([['api', ['T-003', 'T-004']], ['ui', ['T-001', 'T-003']], ['', ['T-002']]])
  })

  test('the board: a section by first label, the order kept within one, the ones with none last', () => {
    const section = groupedByLabel({ when: 'this-sprint', title: 'This sprint', tasks })
    expect(section.tasks.map(one => one.id)).toEqual(['T-003', 'T-004', 'T-001', 'T-002'])
  })
})
