import type { FsEntry } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import {
  appOf, authorsOf, devTeammateRules, flowOf, flowOfAnswer, flowOptions, flowQuestion, lookAt, megabytesOf,
  recommend, teammateRules, usesWorktree,
} from '../hooks/gitflow'
import type { ProjectFacts, Probe } from '../hooks/gitflow'

const SOLO_LIGHT: ProjectFacts = { hasGitHub: true, cacheMb: 300, app: '', authors: 1, prChecks: false }

describe('git flow', () => {
  test('gitFlow names the flow; the old "PR per task" switch still means worktree and PR; else straight to main', () => {
    expect(flowOf({})).toBe('direct')
    expect(flowOf({ gitFlow: 'dev-prs', pullRequests: true })).toBe('dev-prs')
    expect(flowOf({ pullRequests: true })).toBe('worktree-prs')
    expect(flowOf({ gitFlow: 'nonsense' })).toBe('direct')
  })

  test('worktrees only in the worktree flow, or straight to main with the old worktree switch', () => {
    expect(usesWorktree('worktree-prs', false)).toBe(true)
    expect(usesWorktree('dev-prs', true)).toBe(false)
    expect(usesWorktree('direct', true)).toBe(true)
    expect(usesWorktree('direct', false)).toBe(false)
  })

  test('no GitHub remote: straight to main, whatever else', () => {
    expect(recommend({ ...SOLO_LIGHT, hasGitHub: false, cacheMb: 90_000, authors: 4 })).toEqual({ flow: 'direct', reason: 'no GitHub remote, so no PRs' })
  })

  test('a heavy build or an app to install: the shared dev branch', () => {
    expect(recommend({ ...SOLO_LIGHT, cacheMb: 82_000, app: 'an Xcode app' })).toEqual({ flow: 'dev-prs', reason: 'a 80.1 GB build cache and an Xcode app to install' })
    expect(recommend({ ...SOLO_LIGHT, cacheMb: undefined })).toEqual({ flow: 'dev-prs', reason: 'a build cache too big to measure quickly' })
    expect(recommend({ ...SOLO_LIGHT, app: 'a Flutter app' })).toEqual({ flow: 'dev-prs', reason: 'a Flutter app to install' })
  })

  test('a light project with a team or CI on PRs: a worktree and PR each', () => {
    expect(recommend({ ...SOLO_LIGHT, authors: 3 }).flow).toBe('worktree-prs')
    expect(recommend({ ...SOLO_LIGHT, prChecks: true })).toEqual({ flow: 'worktree-prs', reason: 'CI runs on PRs, and a copy is cheap to set up' })
  })

  test('solo, light, no CI on PRs: straight to main', () => {
    expect(recommend(SOLO_LIGHT)).toEqual({ flow: 'direct', reason: 'one person, a light build and no CI on PRs' })
  })

  test('people count once per name; bots are not people', () => {
    const shortlog = '   266\tIosif Nicolae <iosif@bringes.io>\n    30\tBogdan Baghiu <b@x.com>\n    25\tBogdan Baghiu <team@bringes.io>\n    23\tgithub-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>\n     2\tdependabot <d@x>\n'
    expect(authorsOf(shortlog)).toBe(3)
    expect(authorsOf('')).toBe(0)
  })

  test('du lines add up to MB', () => {
    expect(megabytesOf('1048576\t/p/target\n524288\t/p/app/node_modules\n')).toBe(1536)
  })

  test('an app to install, from file names', () => {
    expect(appOf(['README.md', 'BRD.xcodeproj'])).toBe('an Xcode app')
    expect(appOf(['pubspec.yaml', 'android'])).toBe('a Flutter app')
    expect(appOf(['src-tauri'])).toBe('a Tauri app')
    expect(appOf(['package.json', 'src'])).toBe('')
  })

  test('the question lists the three flows and the recommendation; the recommended option comes first', () => {
    const question = flowQuestion({ flow: 'dev-prs', reason: 'a Flutter app to install' })
    expect(question).toContain('Straight to main: small commits land on main in this checkout.')
    expect(question).toContain('Recommended here: Shared dev branch, PR per task (a Flutter app to install).')
    expect(flowOptions('dev-prs')).toEqual(['Shared dev branch, PR per task (Recommended)', 'Straight to main', 'Worktree and PR per task'])
    expect(flowOfAnswer('Shared dev branch, PR per task (Recommended)')).toBe('dev-prs')
    expect(flowOfAnswer('Worktree and PR per task')).toBe('worktree-prs')
    expect(flowOfAnswer('let me think')).toBeUndefined()
  })

  test("each flow's teammate rules say how to commit; the PR flows say what a PR's description holds", () => {
    expect(teammateRules('direct', '/bin', 'dev', 'PR')).toContain('`/bin/land.sh -m "<what changed> (T-004)" -- <your paths>`')
    const dev = devTeammateRules('/bin', 'develop')
    expect(dev).toContain('`/bin/land.sh -b develop -m')
    expect(dev).toContain('python3 /bin/task_pr.py open T-004 --body-file <scratchpad>/pr.md')
    expect(dev).toContain('"Asked for": the user\'s request')
    expect(teammateRules('worktree-prs', '/bin', 'dev', 'PR RULES')).toMatch(/^PR RULES\n- The PR's description/)
  })
})

const dir = (name: string): FsEntry => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })
const file = (name: string): FsEntry => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })

describe('looking at a project', () => {
  test('one look: remote, people, caches one level down, an app, CI on PRs', async () => {
    const lists: Record<string, FsEntry[]> = {
      '/p': [dir('app'), dir('.github'), dir('node_modules'), file('package.json')],
      '/p/app': [dir('target'), file('pubspec.yaml')],
      '/p/.github/workflows': [file('pr.yml'), file('release.yml')],
    }
    const ran: string[][] = []
    const probe: Probe = {
      root: '/p',
      run: async argv => {
        ran.push(argv)
        if (argv[0] === 'git' && argv[1] === 'remote') return 'origin\tgit@github.com:me/app.git (fetch)\n'
        if (argv[0] === 'git') return '   10\tMe <me@x>\n'
        return '2097152\t/p/node_modules\n1048576\t/p/app/target\n'
      },
      list: async path => {
        const found = lists[path]
        if (!found) throw new Error('ENOENT')
        return found
      },
      read: async path => (path.endsWith('pr.yml') ? 'on:\n  pull_request:\n' : 'on: release'),
    }
    expect(await lookAt(probe)).toEqual({ hasGitHub: true, cacheMb: 3072, app: 'a Flutter app', authors: 1, prChecks: true })
    expect(ran).toContainEqual(['du', '-sk', '/p/node_modules', '/p/app/target'])
  })

  test('du out of time: the cache counts as too big to measure', async () => {
    const probe: Probe = {
      root: '/p',
      run: async argv => (argv[0] === 'du' ? undefined : ''),
      list: async path => (path === '/p' ? [dir('target')] : []),
      read: async () => undefined,
    }
    expect((await lookAt(probe)).cacheMb).toBeUndefined()
  })
})
