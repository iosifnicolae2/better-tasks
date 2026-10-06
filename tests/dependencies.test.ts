import { describe, expect, test } from 'claude-code/testing'

import type { Task } from '../types'
import { openTaskLines } from '../hooks/coordinator'
import { fingerprintOf } from '../hooks/status'
import { startPrompt } from '../hooks/taskflow'
import { blockersOf, dependencyProblem, formatTask, isBlocked, parseTask, taskLine, unblockedBy, waitsText } from '../hooks/tasks'

// Tasks that depend on others: the dependsOn field, the checks on it, and what a blocked task shows.

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
  dependsOn: [],
  file: `/p/.claude/tasks/${id}.md`,
  body: '## Goal\n\n## Notes\n',
  ...fields,
})

describe('the dependsOn field', () => {
  test('written as a YAML list after the other fields, and read back', () => {
    const waiting = task('T-003', { dependsOn: ['T-001', 'T-002'] })
    const text = formatTask(waiting)
    expect(text).toContain('created: 2026-10-03\ndependsOn: [T-001, T-002]\n---\n')
    expect(parseTask(text, waiting.file)).toEqual(waiting)
  })

  test('left out when empty; a hand-written one reads with or without brackets', () => {
    expect(formatTask(task('T-001'))).not.toContain('dependsOn')
    expect(parseTask('---\nid: T-001\n---\n', '/f.md').dependsOn).toEqual([])
    expect(parseTask('---\nid: T-003\ndependsOn: T-001,T-002\n---\n', '/f.md').dependsOn).toEqual(['T-001', 'T-002'])
    expect(parseTask('---\nid: T-003\ndependsOn: ["T-001"]\n---\n', '/f.md').dependsOn).toEqual(['T-001'])
  })
})

describe('checks', () => {
  const tasks = [task('T-001'), task('T-002', { dependsOn: ['T-001'] }), task('T-003', { dependsOn: ['T-002'] })]

  test('existing tasks, in any case: fine', () => {
    expect(dependencyProblem('T-004', ['T-001', 't-003'], tasks)).toBeUndefined()
  })

  test('an unknown id, or the task itself, is refused', () => {
    expect(dependencyProblem('T-004', ['T-001', 'T-099'], tasks)).toBe('No task T-099: dependsOn takes the ids of existing tasks.')
    expect(dependencyProblem('T-002', ['T-002'], tasks)).toBe("T-002 can't depend on itself.")
  })

  test('a cycle is refused and named, however long', () => {
    expect(dependencyProblem('T-001', ['T-002'], tasks)).toBe('That makes a cycle, T-001 → T-002 → T-001: drop one of these dependencies.')
    expect(dependencyProblem('T-001', ['t-003'], tasks)).toBe('That makes a cycle, T-001 → T-003 → T-002 → T-001: drop one of these dependencies.')
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

  test('a changed dependency list is news for the status check', () => {
    expect(fingerprintOf([cart], [])).not.toBe(fingerprintOf([{ ...cart, dependsOn: [] }], []))
  })
})
