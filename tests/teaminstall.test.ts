import { describe, expect, test } from 'claude-code/testing'

import { gitQuestion, USE_QUESTION, withIgnored } from '../hooks/projectsetup'
import { hasTeamInstall, TEAM_QUESTION, withTeamInstall } from '../hooks/teaminstall'

describe('sharing better-tasks with the team', () => {
  test('the shared settings get the marketplace and the plugin; other keys and plugins stay', () => {
    const before = JSON.stringify({ model: 'opus', enabledPlugins: { 'other@market': true } })
    const after = JSON.parse(withTeamInstall(before) ?? '')
    expect(after.model).toBe('opus')
    expect(after.enabledPlugins).toEqual({ 'other@market': true, 'better-tasks@better-tasks': true })
    expect(after.extraKnownMarketplaces['better-tasks']).toEqual({ source: { source: 'github', repo: 'iosifnicolae2/better-tasks' } })
    expect(hasTeamInstall(withTeamInstall(undefined))).toBe(true)
  })

  test('not there yet, or a file that is not JSON: no team install; a broken file is never rewritten', () => {
    expect(hasTeamInstall(undefined)).toBe(false)
    expect(hasTeamInstall('{"enabledPlugins": {"better-tasks@better-tasks": false}}')).toBe(false)
    expect(hasTeamInstall('{ not json')).toBe(false)
    expect(withTeamInstall('{ not json')).toBeUndefined()
  })

  test('the question says what each answer does, and that a shared file gets committed', () => {
    expect(TEAM_QUESTION).toContain('.claude/settings.json')
    expect(TEAM_QUESTION).toContain('commits that one file')
    expect(TEAM_QUESTION.endsWith('?')).toBe(true)
  })
})

describe('task files in git', () => {
  test('"No" adds the task folder to .gitignore once, keeping what is there', () => {
    expect(withIgnored(undefined, '.claude/tasks')).toBe('.claude/tasks/\n')
    expect(withIgnored('dist', '.claude/tasks')).toBe('dist\n.claude/tasks/\n')
    expect(withIgnored('/.claude/tasks/\n', '.claude/tasks')).toBeUndefined()
    expect(withIgnored('.claude/tasks\n', '.claude/tasks/')).toBeUndefined()
  })

  test('the questions say what each answer does and how to undo it', () => {
    expect(USE_QUESTION).toContain('"useBetterTasks": true')
    expect(gitQuestion('work')).toContain('adds work/ to .gitignore')
  })
})
