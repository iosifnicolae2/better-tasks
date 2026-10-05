import { describe, expect, test } from 'claude-code/testing'

import { hasTeamInstall, lacksAutoUpdate, TEAM_QUESTION, withTeamInstall } from '../hooks/teaminstall'

describe('sharing better-tasks with the team', () => {
  test('the shared settings get the marketplace and the plugin; other keys and plugins stay', () => {
    const before = JSON.stringify({ model: 'opus', enabledPlugins: { 'other@market': true } })
    const after = JSON.parse(withTeamInstall(before) ?? '')
    expect(after.model).toBe('opus')
    expect(after.enabledPlugins).toEqual({ 'other@market': true, 'better-tasks@better-tasks': true })
    expect(after.extraKnownMarketplaces['better-tasks']).toEqual({ source: { source: 'github', repo: 'iosifnicolae2/better-tasks' }, autoUpdate: true })
    expect(hasTeamInstall(withTeamInstall(undefined))).toBe(true)
  })

  test('auto-update: missing only in an install shared before it existed; adding it keeps the rest', () => {
    const older = JSON.stringify({
      extraKnownMarketplaces: { 'better-tasks': { source: { source: 'github', repo: 'iosifnicolae2/better-tasks' } } },
      enabledPlugins: { 'better-tasks@better-tasks': true },
    })
    expect(lacksAutoUpdate(older)).toBe(true)
    expect(lacksAutoUpdate(withTeamInstall(older))).toBe(false)
    expect(lacksAutoUpdate(undefined)).toBe(false)
    expect(lacksAutoUpdate('{ not json')).toBe(false)
  })

  test('turning on auto-update keeps a marketplace source already there (a fork)', () => {
    const fork = { source: { source: 'github', repo: 'someone/better-tasks' } }
    const before = JSON.stringify({ extraKnownMarketplaces: { 'better-tasks': fork }, enabledPlugins: { 'better-tasks@better-tasks': true } })
    const after = JSON.parse(withTeamInstall(before) ?? '')
    expect(after.extraKnownMarketplaces['better-tasks']).toEqual({ ...fork, autoUpdate: true })
  })

  test('not there yet, or a file that is not JSON: no team install; a broken file is never rewritten', () => {
    expect(hasTeamInstall(undefined)).toBe(false)
    expect(hasTeamInstall('{"enabledPlugins": {"better-tasks@better-tasks": false}}')).toBe(false)
    expect(hasTeamInstall('{ not json')).toBe(false)
    expect(withTeamInstall('{ not json')).toBeUndefined()
  })

  test('the question is short', () => {
    expect(TEAM_QUESTION.length).toBeLessThan(120)
    expect(TEAM_QUESTION.endsWith('?')).toBe(true)
  })
})
