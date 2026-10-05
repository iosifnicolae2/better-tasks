import { describe, expect, test } from 'claude-code/testing'

import { addSource, hasTeamInstall, maySelfCommit, needsPin, pinnedTag, repoUrl, TEAM_QUESTION, withTeamInstall } from '../hooks/teaminstall'

const UPSTREAM = { source: 'github', repo: 'iosifnicolae2/better-tasks' }
const shared = (marketplace: object) => JSON.stringify({ extraKnownMarketplaces: { 'better-tasks': marketplace }, enabledPlugins: { 'better-tasks@better-tasks': true } })

describe('sharing better-tasks with the team', () => {
  test('the shared settings get the marketplace pinned to a release and the plugin; other keys and plugins stay', () => {
    const before = JSON.stringify({ model: 'opus', enabledPlugins: { 'other@market': true } })
    const after = JSON.parse(withTeamInstall(before, 'v0.10.7') ?? '')
    expect(after.model).toBe('opus')
    expect(after.enabledPlugins).toEqual({ 'other@market': true, 'better-tasks@better-tasks': true })
    expect(after.extraKnownMarketplaces['better-tasks']).toEqual({ source: { ...UPSTREAM, ref: 'v0.10.7' } })
    expect(hasTeamInstall(withTeamInstall(undefined, 'v0.10.7'))).toBe(true)
    expect(pinnedTag(withTeamInstall(undefined, 'v0.10.7'))).toBe('v0.10.7')
  })

  test('unpinned: no ref, a branch, or autoUpdate on; pinning drops autoUpdate and keeps the rest', () => {
    const autoUpdating = shared({ source: UPSTREAM, autoUpdate: true })
    expect(needsPin(shared({ source: UPSTREAM }))).toBe(true)
    expect(needsPin(shared({ source: { ...UPSTREAM, ref: 'main' } }))).toBe(true)
    expect(needsPin(shared({ source: { ...UPSTREAM, ref: 'v0.10.7' }, autoUpdate: true }))).toBe(true)
    expect(needsPin(autoUpdating)).toBe(true)
    const pinned = withTeamInstall(autoUpdating, 'v0.10.7')
    expect(needsPin(pinned)).toBe(false)
    expect(JSON.parse(pinned ?? '').extraKnownMarketplaces['better-tasks']).toEqual({ source: { ...UPSTREAM, ref: 'v0.10.7' } })
    expect(needsPin(undefined)).toBe(false)
    expect(needsPin('{ not json')).toBe(false)
  })

  test('a fork keeps its source when pinned; its repo is the one asked for releases', () => {
    const fork = { source: 'github', repo: 'someone/better-tasks' }
    const after = JSON.parse(withTeamInstall(shared({ source: fork, autoUpdate: true }), 'v1.0.0') ?? '')
    expect(after.extraKnownMarketplaces['better-tasks']).toEqual({ source: { ...fork, ref: 'v1.0.0' } })
    expect(repoUrl(shared({ source: fork }))).toBe('https://github.com/someone/better-tasks.git')
    expect(addSource(shared({ source: fork }))).toBe('someone/better-tasks')
    expect(repoUrl(undefined)).toBe('https://github.com/iosifnicolae2/better-tasks.git')
    const git = { source: 'git', url: 'https://example.com/bt.git' }
    expect(repoUrl(shared({ source: git }))).toBe('https://example.com/bt.git')
    expect(addSource(shared({ source: git }))).toBe('https://example.com/bt.git')
  })

  test('a pin better-tasks made itself is committed straight to main, on the dev branch only, never with a worktree per task', () => {
    expect(maySelfCommit('direct', 'main', 'dev')).toBe(true)
    expect(maySelfCommit('dev-prs', 'dev', 'dev')).toBe(true)
    expect(maySelfCommit('dev-prs', 'main', 'dev')).toBe(false)
    expect(maySelfCommit('worktree-prs', 'main', 'dev')).toBe(false)
  })

  test('not there yet, or a file that is not JSON: no team install; a broken file is never rewritten', () => {
    expect(hasTeamInstall(undefined)).toBe(false)
    expect(hasTeamInstall('{"enabledPlugins": {"better-tasks@better-tasks": false}}')).toBe(false)
    expect(hasTeamInstall('{ not json')).toBe(false)
    expect(withTeamInstall('{ not json', 'v0.10.7')).toBeUndefined()
  })

  test('the question is short', () => {
    expect(TEAM_QUESTION.length).toBeLessThan(120)
    expect(TEAM_QUESTION.endsWith('?')).toBe(true)
  })
})
