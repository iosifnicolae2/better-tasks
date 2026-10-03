import { describe, expect, test } from 'claude-code/testing'

import type { Task } from '../types'
import { parseOverrides, settingsOf } from '../hooks/settings'
import { fileNameOf, nextId } from '../hooks/tasks'
import { EXTEND, resolveText, starterFiles } from '../hooks/texts'

const task = (id: string) => ({ id }) as Task

describe('task numbering', () => {
  test('prefix, padding and start come from the settings', () => {
    const naming = settingsOf({ taskPrefix: 'BUG-', taskPadding: 2, taskStart: 10 }).tasks
    expect(nextId([], naming)).toBe('BUG-10')
    expect(nextId([task('BUG-10'), task('T-099')], naming)).toBe('BUG-11')
    expect(nextId([task('T-007')])).toBe('T-008')
  })

  test('the file name pattern', () => {
    const naming = settingsOf({ taskFileName: '{id}.md' }).tasks
    expect(fileNameOf(naming, 'BUG-10', 'Fix it')).toBe('BUG-10.md')
    expect(fileNameOf(settingsOf({}).tasks, 'T-001', 'Fix the login!')).toBe('T-001-fix-the-login.md')
  })
})

describe('config.json', () => {
  test('known keys apply; unknown keys and wrong types are skipped with a reason', () => {
    const { values, problems } = parseOverrides(
      JSON.stringify({ '//': 'a note', taskPrefix: 'X-', colour: 'red', contextLimit: 'high', sprintWeeks: 2 }),
    )
    expect(values).toEqual({ taskPrefix: 'X-', sprintWeeks: 2 })
    expect(problems).toEqual(['unknown key "colour"', '"contextLimit" must be a number'])
    expect(settingsOf(values).sprint.weeks).toBe(2)
  })

  test('bad JSON gives one problem and no values', () => {
    const { values, problems } = parseOverrides('{ taskPrefix: ')
    expect(values).toEqual({})
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('is not valid JSON')
  })

  test('the project wins over the plugin options, which win over the defaults', () => {
    const settings = settingsOf({ ...{ editor: 'code', contextLimit: 70 }, ...{ contextLimit: 40 } })
    expect([settings.editor, settings.contextLimit, settings.tasks.prefix]).toEqual(['code', 40, 'T-'])
  })
})

describe('text overrides', () => {
  test('no file: the shipped text', () => {
    expect(resolveText('Shipped.', undefined)).toBe('Shipped.')
  })

  test('a plain file replaces it; comments never reach the model', () => {
    expect(resolveText('Shipped.', '<!-- note -->\nMine.\n')).toBe('Mine.')
  })

  test('the extend marker adds to it', () => {
    expect(resolveText('Shipped.', `${EXTEND}\nAlso this.`)).toBe('Shipped.\n\nAlso this.')
    expect(resolveText('Shipped.', `${EXTEND}\n<!-- only notes -->\n`)).toBe('Shipped.')
  })

  test('starter files change nothing until edited', () => {
    const starters = starterFiles()
    expect(Object.keys(starters)).toEqual([
      '.claude/tasks/config.json',
      '.claude/tasks/coordinator.md',
      '.claude/tasks/teammate.md',
      '.claude/tasks/task-template.md',
      '.claude/tasks/tips.md',
    ])
    expect(parseOverrides(starters['.claude/tasks/config.json'] ?? '')).toEqual({ values: {}, problems: [] })
    expect(resolveText('Shipped.', starters['.claude/tasks/teammate.md'])).toBe('Shipped.')
  })
})
