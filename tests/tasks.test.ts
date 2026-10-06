import { describe, expect, test } from 'claude-code/testing'

import type { Task } from '../types'
import { realigned, rolledOver, shippedIn } from '../hooks/boundary'
import { goalOf, withGoal, withReview } from '../hooks/sprintlog'
import { logRow } from '../hooks/taskflow'
import { isQuestion, openTaskLines } from '../hooks/coordinator'
import { spawnTask, taskIdIn, withSummary } from '../hooks/spawn'
import { bodyOf, edgeOrder, formatTask, nextId, parseTask, placeOf, slugOf, whenOf, withGoalText, withNote } from '../hooks/tasks'

const CONFIG = { weeks: 1, startDay: 1 } as const
const TODAY = '2026-10-07'
const CURRENT = '2026-10-05'

const task = (fields: Partial<Task>): Task => ({
  id: 'T-001',
  title: 'Fix login redirect',
  sprint: CURRENT,
  urgent: false,
  status: 'todo',
  owner: '',
  rolled: 0,
  order: 0,
  created: '2026-10-03',
  file: '/p/.claude/tasks/T-001-fix-login-redirect.md',
  body: bodyOf('Users land on /home after login.'),
  ...fields,
})

describe('task files', () => {
  test('frontmatter round-trips', () => {
    const original = task({ owner: 'auth', rolled: 2, order: -3, urgent: true, title: 'Fix: the redirect' })
    expect(parseTask(formatTask(original), original.file)).toEqual(original)
  })

  test('a hand-edited file with missing fields still reads', () => {
    const parsed = parseTask('---\nid: T-009\ntitle: Hello\n---\nbody', '/f.md')
    expect(parsed).toEqual(expect.objectContaining({ id: 'T-009', sprint: 'backlog', status: 'todo', rolled: 0, order: 0, body: 'body' }))
  })

  test('ids and slugs', () => {
    expect(nextId([])).toBe('T-001')
    expect(nextId([task({ id: 'T-009' }), task({ id: 'T-010' })])).toBe('T-011')
    expect(slugOf('Fix the Login redirect!! (prod)')).toBe('fix-the-login-redirect-prod')
  })

  test('notes go at the end of the Notes section', () => {
    const body = `${bodyOf('g')}- old\n\n## Plan\nstep`
    const noted = withNote(body, '2026-10-07', 'started')
    expect(noted).toContain('- old\n- 2026-10-07: started\n\n## Plan')
  })
})

describe('when a task is', () => {
  test('placing by when', () => {
    expect(placeOf('now', TODAY, CONFIG)).toEqual({ sprint: CURRENT, urgent: true })
    expect(placeOf('this-sprint', TODAY, CONFIG)).toEqual({ sprint: CURRENT, urgent: false })
    expect(placeOf('next-sprint', TODAY, CONFIG)).toEqual({ sprint: '2026-10-12', urgent: false })
    expect(placeOf('backlog', TODAY, CONFIG)).toEqual({ sprint: 'backlog', urgent: false })
  })

  test('reading when back', () => {
    for (const when of ['now', 'this-sprint', 'next-sprint', 'backlog'] as const) {
      expect(whenOf(task(placeOf(when, TODAY, CONFIG)), TODAY, CONFIG)).toBe(when)
    }
  })
})

describe('order within a section', () => {
  test('top and bottom edges count only the same section', () => {
    const tasks = [
      task({ id: 'T-001', order: 2 }),
      task({ id: 'T-002', order: 5 }),
      task({ id: 'T-003', order: 9, urgent: true }),
      task({ id: 'T-004', order: 7, sprint: 'backlog' }),
    ]
    const thisSprint = { sprint: CURRENT, urgent: false }
    expect(edgeOrder(tasks, thisSprint, 'bottom')).toBe(6)
    expect(edgeOrder(tasks, thisSprint, 'top')).toBe(1)
    expect(edgeOrder(tasks, { sprint: '2026-10-12', urgent: false }, 'bottom')).toBe(0)
  })
})

describe('sprint boundary', () => {
  test('open work of past sprints rolls over; done and backlog stay', () => {
    const tasks = [
      task({ id: 'T-001', sprint: '2026-09-28' }),
      task({ id: 'T-002', sprint: '2026-09-28', status: 'done' }),
      task({ id: 'T-003', sprint: 'backlog' }),
      task({ id: 'T-004', sprint: '2026-09-21', status: 'doing', rolled: 1 }),
      task({ id: 'T-005', sprint: CURRENT }),
    ]
    const moved = rolledOver(tasks, CURRENT)
    expect(moved.map(one => [one.id, one.sprint, one.rolled])).toEqual([
      ['T-001', CURRENT, 1],
      ['T-004', CURRENT, 2],
    ])
    expect(shippedIn(tasks, '2026-09-28').map(one => one.id)).toEqual(['T-002'])
  })

  test('a length or start-day change puts every task back on a boundary', () => {
    const twoWeeks = { weeks: 2, startDay: 1 } as const // the current two-week sprint: Sep 28 – Oct 11
    const tasks = [
      task({ id: 'T-001', sprint: '2026-10-05' }), // was this week's sprint: now inside the current one
      task({ id: 'T-002', sprint: '2026-10-12' }), // next sprint, still a boundary: stays
      task({ id: 'T-003', sprint: '2026-09-21', status: 'done' }), // history: the sprint holding its date
      task({ id: 'T-004', sprint: '2026-09-21' }), // open in a past sprint: the current one
      task({ id: 'T-005', sprint: 'backlog' }),
    ]
    expect(realigned(tasks, '2026-09-28', twoWeeks).map(one => [one.id, one.sprint])).toEqual([
      ['T-001', '2026-09-28'],
      ['T-003', '2026-09-14'],
      ['T-004', '2026-09-28'],
    ])
    expect(realigned(tasks.slice(0, 2), CURRENT, CONFIG)).toEqual([])
  })

  test('sprints.md keeps one goal per sprint and the review', () => {
    let text = withGoal('', CURRENT, 'Sprint 41 · Oct 5–11', 'Ship login')
    text = withGoal(text, '2026-10-12', 'Sprint 42 · Oct 12–18', 'Billing')
    text = withGoal(text, CURRENT, 'Sprint 41 · Oct 5–11', 'Ship login v2')
    expect(goalOf(text, CURRENT)).toBe('Ship login v2')
    expect(goalOf(text, '2026-10-12')).toBe('Billing')
    expect(goalOf(text, '2026-10-19')).toBe('')

    text = withReview(text, CURRENT, 'Sprint 41 · Oct 5–11', {
      shipped: [task({ id: 'T-002', title: 'Done thing' })],
      rolled: [],
    })
    expect(text).toContain('## 2026-10-05 · Sprint 41 · Oct 5–11\nGoal: Ship login v2\n\n### Review\nShipped:\n- T-002 Done thing\nRolled over:\n- none\n')
    expect(goalOf(text, '2026-10-12')).toBe('Billing')
  })

  test('a finished-task row has the CLAUDE.md columns', () => {
    const row = logRow(task({ owner: 'auth' }), TODAY, 'abc', { note: 'Fixed | done', commits: '1a2b3c' })
    expect(row).toBe('2026-10-07 | auth | T-001 Fix login redirect | Fixed / done | 1a2b3c | session abc teammate auth\n')
  })
})

describe('filing messages', () => {
  test('questions are told from work', () => {
    expect(isQuestion("what's in this sprint?")).toBe(true)
    expect(isQuestion('Show me the backlog')).toBe(true)
    expect(isQuestion('the export button is too small')).toBe(false)
    expect(isQuestion('fix the login redirect')).toBe(false)
  })

  test('open tasks in the context: near ones all, then the 10 newest others', () => {
    const near = [task({ id: 'T-001', owner: 'auth' }), task({ id: 'T-002', urgent: true })]
    const later = Array.from({ length: 12 }, (_, n) =>
      task({ id: `T-${String(n + 10).padStart(3, '0')}`, sprint: 'backlog', created: `2026-09-${String(n + 10).padStart(2, '0')}` }),
    )
    const lines = openTaskLines([...near, ...later, task({ id: 'T-099', status: 'done' })], TODAY, CONFIG)
    expect(lines[0]).toBe('Open tasks (match the message against these):')
    expect(lines.slice(1, 3)).toEqual(['- T-001 Fix login redirect · this sprint · auth', '- T-002 Fix login redirect · currently working on'])
    expect(lines[3]).toBe('- T-021 Fix login redirect · backlog')
    expect(lines).toHaveLength(1 + 2 + 10 + 1)
    expect(lines.at(-1)).toBe('- … 2 more: task_list')
  })

  test('a new goal replaces the Goal section only', () => {
    expect(withGoalText(bodyOf('Old goal.') + '- 2026-10-01: a note\n', 'New goal.')).toBe('## Goal\nNew goal.\n\n## Notes\n- 2026-10-01: a note\n')
  })
})

describe('spawn summaries', () => {
  test('the id a prompt names, with the project prefix', () => {
    expect(taskIdIn('You own task T-004. File: .claude/tasks/T-004-x.md', 'T-')).toBe('T-004')
    expect(taskIdIn('see BUG-12 and T-3', 'BUG-')).toBe('BUG-12')
    expect(taskIdIn('no id here', 'T-')).toBeUndefined()
  })

  test('the task a spawn is for: by id, else the one open task its name owns', () => {
    const tasks = [task({ id: 'T-001', owner: 'login' }), task({ id: 'T-002', owner: 'ci' }), task({ id: 'T-003', owner: 'ci' })]
    expect(spawnTask(tasks, 'Finish T-002', 'login', 'T-')?.id).toBe('T-002')
    expect(spawnTask(tasks, 'Carry on', 'login', 'T-')?.id).toBe('T-001')
    expect(spawnTask(tasks, 'Carry on', 'ci', 'T-')).toBeUndefined()
  })

  test('the summary comes first, once', () => {
    const one = task({ id: 'T-001', title: 'Fix login redirect' })
    expect(withSummary({ description: 'x', prompt: 'Go.' }, one)).toEqual({ description: 'Fix login redirect · T-001', prompt: 'Fix login redirect · T-001\n\nGo.' })
    expect(withSummary({ description: 'x', prompt: 'Fix login redirect · T-001\n\nGo.' }, one).prompt).toBe('Fix login redirect · T-001\n\nGo.')
  })
})
