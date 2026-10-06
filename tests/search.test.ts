import { describe, expect, test } from 'claude-code/testing'

import type { Task } from '../types'
import { fold, matchRanges, searchTasks } from '../hooks/search'

const task = (id: string, title: string, body = '', fields: Partial<Task> = {}): Task => ({
  id,
  title,
  sprint: '2026-10-05',
  urgent: false,
  status: 'todo',
  owner: '',
  rolled: 0,
  order: 0,
  created: '2026-10-01',
  labels: [],
  dependsOn: [],
  file: `/p/${id}.md`,
  body: `## Goal\n${body}\n\n## Notes\n`,
  ...fields,
})

const ids = (hits: { task: Task }[]) => hits.map(hit => hit.task.id)

describe('task search', () => {
  const tasks = [
    task('T-001', 'Speed up CI', 'The login tests are slow on the redirect step.'),
    task('T-002', 'Fix login redirect', 'Users land on /home.'),
    task('T-003', 'Login page copy', 'Reword the redirect notice.'),
    task('T-004', 'Café menu', 'Accented títle test.', { status: 'done', created: '2026-09-01' }),
  ]

  test('a title match outranks a body match; the whole phrase in a title ranks first', () => {
    expect(ids(searchTasks(tasks, 'login redirect'))).toEqual(['T-002', 'T-003', 'T-001'])
  })

  test('an exact id comes first', () => {
    expect(ids(searchTasks(tasks, 't-003'))[0]).toBe('T-003')
    expect(searchTasks(tasks, 'T-003')[0]?.fields).toContain('id')
  })

  test('all words must match', () => {
    expect(ids(searchTasks(tasks, 'login slow'))).toEqual(['T-001'])
    expect(searchTasks(tasks, 'login banana')).toEqual([])
  })

  test('case and accents do not matter, and closed tasks are found', () => {
    expect(fold('Café TÍTLE')).toBe('cafe title')
    expect(ids(searchTasks(tasks, 'CAFE'))).toEqual(['T-004'])
    expect(ids(searchTasks(tasks, 'title'))).toEqual(['T-004'])
  })

  test('title words beat title prefixes, and open beats closed on a tie', () => {
    const more = [task('T-010', 'Logs cleanup'), task('T-011', 'Log rotation'), task('T-012', 'Log viewer', '', { status: 'done' })]
    expect(ids(searchTasks(more, 'log'))).toEqual(['T-011', 'T-012', 'T-010'])
  })

  test('a snippet around the first body match, and the fields that matched', () => {
    const [hit] = searchTasks(tasks, 'slow')
    expect(hit?.snippet).toBe('The login tests are slow on the redirect step.')
    expect(hit?.fields).toEqual(['body'])
    const [titleOnly] = searchTasks(tasks, 'speed')
    expect(titleOnly?.snippet).toBeUndefined()
    expect(titleOnly?.titleMatches).toEqual([[0, 5]])
    const long = task('T-020', 'Long', `${'a'.repeat(80)} needle ${'b'.repeat(80)}`)
    expect(searchTasks([long], 'needle')[0]?.snippet).toMatch(/^…a+ needle b+…$/)
  })

  test('ranges to highlight, in the title and in the snippet', () => {
    const [hit] = searchTasks(tasks, 'login redirect')
    expect(hit?.titleMatches).toEqual([[4, 9], [10, 18]])
    const [body] = searchTasks(tasks, 'slow')
    expect(body?.snippetMatches).toEqual([[20, 24]])
    expect(matchRanges('Café café', ['cafe'])).toEqual([[0, 4], [5, 9]])
    expect(matchRanges('redirected', ['redirect', 'direct'])).toEqual([[0, 8]])
  })

  test('the template headings never match', () => {
    expect(searchTasks(tasks, 'goal')).toEqual([])
  })
})
