import { describe, expect, test } from 'claude-code/testing'

import { activeInstall, declaresMarketplace, isNewer, lsRemoteArgv, newestTag, offeredRelease, pinTarget, releaseTags, repinArgv, updateArgv, updateQuestion } from '../hooks/updatecheck'

const LS_REMOTE = ['aaa\trefs/tags/v0.9.0', 'bbb\trefs/tags/v0.10.7', 'ccc\trefs/tags/v0.10.10', 'ddd\trefs/tags/nightly', 'eee\trefs/tags/v1.0.0-rc1'].join('\n')
const ROOT = '/work/app'
const CACHE = '/home/me/.claude/plugins/cache/better-tasks/better-tasks'

describe('the startup update check', () => {
  test('release tags: vX.Y.Z only, compared as numbers', () => {
    expect(releaseTags(LS_REMOTE)).toEqual(['v0.9.0', 'v0.10.7', 'v0.10.10'])
    expect(newestTag(releaseTags(LS_REMOTE))).toBe('v0.10.10')
    expect(isNewer('v0.10.10', 'v0.9.0')).toBe(true)
    expect(isNewer('v0.10.7', 'v0.10.7')).toBe(false)
    expect(newestTag([])).toBeUndefined()
  })

  test('offered: the newest release, when newer than the installed one or the pin, and not declined', () => {
    const tags = ['v0.10.7', 'v0.10.8']
    expect(offeredRelease(tags, '0.10.7', 'v0.10.7', undefined)).toBe('v0.10.8')
    expect(offeredRelease(tags, '0.10.8', 'v0.10.7', undefined)).toBe('v0.10.8') // installed, but the project still pins the old one
    expect(offeredRelease(tags, '0.10.8', undefined, undefined)).toBeUndefined()
    expect(offeredRelease(tags, '0.10.7', undefined, 'v0.10.8')).toBeUndefined() // said No to it
    expect(offeredRelease([...tags, 'v0.10.9'], '0.10.7', undefined, 'v0.10.8')).toBe('v0.10.9')
    expect(offeredRelease([], '0.10.7', undefined, undefined)).toBeUndefined() // offline
  })

  test('the pin: the installed release when the repo has it or is offline, else the newest', () => {
    expect(pinTarget(['v0.10.7', 'v0.10.8'], '0.10.7')).toBe('v0.10.7')
    expect(pinTarget([], '0.10.7')).toBe('v0.10.7')
    expect(pinTarget(['v1.0.0'], '0.10.7')).toBe('v1.0.0')
    expect(pinTarget(['v1.0.0'], undefined)).toBe('v1.0.0')
    expect(pinTarget([], undefined)).toBeUndefined()
  })

  test('the install this session runs: by its folder, this project\'s first; a linked install has none', () => {
    const list = JSON.stringify([
      { id: 'better-tasks@better-tasks', version: '0.10.7', scope: 'user', installPath: `${CACHE}/0.10.7` },
      { id: 'better-tasks@better-tasks', version: '0.10.7', scope: 'project', installPath: `${CACHE}/0.10.7`, projectPath: ROOT },
      { id: 'better-tasks@better-tasks', version: '0.9.0', scope: 'project', installPath: `${CACHE}/0.9.0`, projectPath: '/other' },
    ])
    expect(activeInstall(list, `${CACHE}/0.10.7/`, ROOT)).toEqual({ version: '0.10.7', scope: 'project' })
    expect(activeInstall(list, `${CACHE}/0.10.7`, '/elsewhere')).toEqual({ version: '0.10.7', scope: 'user' })
    expect(activeInstall(list, '/home/me/src/better-tasks', ROOT)).toBeUndefined()
    expect(activeInstall('not json', `${CACHE}/0.10.7`, ROOT)).toBeUndefined()
  })

  test('a source from the shared settings never reads as an option or another transport', () => {
    expect(lsRemoteArgv('--upload-pack=touch /tmp/x')).toEqual(['git', 'ls-remote', '--tags', '--refs', '--', '--upload-pack=touch /tmp/x'])
    for (const source of ['--upload-pack=touch /tmp/x', '-c core.sshCommand=touch /tmp/x', 'ext::sh -c touch% /tmp/x', '-owner/repo', 'https://x.com/a b', 'file:///tmp/repo']) {
      expect(repinArgv(source, 'v1.0.0')).toBeUndefined()
    }
    expect(repinArgv('someone/better-tasks', '--help')).toBeUndefined()
    expect(repinArgv('someone/better-tasks', 'v1.0.0')).toEqual(['claude', 'plugin', 'marketplace', 'add', '--scope', 'project', '--', 'someone/better-tasks#v1.0.0'])
    expect(repinArgv('https://git.example.com/bt.git', 'v1.0.0')?.at(-1)).toBe('https://git.example.com/bt.git#v1.0.0')
    expect(updateArgv('--evil')).toEqual(['claude', 'plugin', 'update', '--scope', 'user', '--', 'better-tasks@better-tasks'])
    expect(updateArgv('project')).toEqual(['claude', 'plugin', 'update', '--scope', 'project', '--', 'better-tasks@better-tasks'])
  })

  test('user or managed settings that declare the marketplace: Claude Code takes its source from there alone', () => {
    const declared = { extraKnownMarketplaces: { 'better-tasks': { source: { source: 'github', repo: 'iosifnicolae2/better-tasks' }, autoUpdate: true } } }
    expect(declaresMarketplace(JSON.stringify(declared))).toBe(true)
    expect(declaresMarketplace(JSON.stringify({ extraKnownMarketplaces: { other: {} } }))).toBe(false)
    expect(declaresMarketplace('{}')).toBe(false)
    expect(declaresMarketplace(undefined)).toBe(false)
    expect(declaresMarketplace('not json')).toBe(false)
    expect(declaresMarketplace('null')).toBe(false)
  })

  test('the question is short and plain', () => {
    expect(updateQuestion('v0.10.8')).toBe('better-tasks v0.10.8 is out. Update?')
  })
})
