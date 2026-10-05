import type { FsEntry } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import {
  appOf, authorsOf, devLeadRules, devTeammateRules, flowOf, flowOfAnswer, flowOptions, flowQuestion, lookAt, megabytesOf, prBodyRules, prSkillSettings,
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
    expect(recommend({ ...SOLO_LIGHT, hasGitHub: false, app: 'an Xcode app', authors: 4 })).toEqual({ flow: 'direct', reason: 'no GitHub remote, so no PRs' })
  })

  test('an app to install: the shared dev branch, solo or not', () => {
    expect(recommend({ ...SOLO_LIGHT, app: 'an Xcode app' })).toEqual({ flow: 'dev-prs', reason: 'an Xcode app to build and install once for every change' })
  })

  test('a team or CI on PRs: a worktree and PR each, or the shared dev branch when a copy is heavy', () => {
    expect(recommend({ ...SOLO_LIGHT, authors: 3 }).flow).toBe('worktree-prs')
    expect(recommend({ ...SOLO_LIGHT, prChecks: true })).toEqual({ flow: 'worktree-prs', reason: 'CI runs on PRs, and a copy is cheap to set up' })
    expect(recommend({ ...SOLO_LIGHT, authors: 2, cacheMb: 82_000 })).toEqual({ flow: 'dev-prs', reason: '2 people commit, and a 80.1 GB build cache for every copy' })
    expect(recommend({ ...SOLO_LIGHT, prChecks: true, cacheMb: undefined })).toEqual({ flow: 'dev-prs', reason: 'CI runs on PRs, and a build cache too big to measure quickly for every copy' })
  })

  test('solo, no app, no CI on PRs: straight to main, however big the build', () => {
    expect(recommend(SOLO_LIGHT)).toEqual({ flow: 'direct', reason: 'one person, no app to install and no CI on PRs' })
    expect(recommend({ ...SOLO_LIGHT, cacheMb: undefined }).flow).toBe('direct')
  })

  test('people count once per name or email; bots are not people', () => {
    const shortlog = [
      '   266\tIosif Nicolae <iosif@bringes.io>',
      '    54\tIosif Bringes <iosif@bringes.io>',
      '    30\tBogdan Baghiu <b@x.com>',
      '    25\tBogdan Baghiu <team@bringes.io>',
      '    23\tgithub-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>',
      '     2\tdependabot <d@x>',
    ].join('\n')
    expect(authorsOf(shortlog)).toBe(2)
    expect(authorsOf('')).toBe(0)
  })

  test('du lines add up to MB', () => {
    expect(megabytesOf('1048576\t/p/target\n524288\t/p/app/node_modules\n')).toBe(1536)
  })

  test('an app to install, from file names', () => {
    expect(appOf(['README.md', 'BRD.xcodeproj'])).toBe('an Xcode app')
    expect(appOf(['pubspec.yaml', 'android'])).toBe('a Flutter app')
    expect(appOf(['tauri.conf.json'])).toBe('a Tauri app')
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

  test("each flow's teammate rules say how to commit; the PR flows point at the pull-request skill", () => {
    expect(teammateRules('direct', '/bin', 'dev', 'PR')).toContain('`/bin/land.sh -m "<what changed> (T-004)" -- <your paths>`')
    expect(teammateRules('direct', '/bin', 'dev', 'PR')).not.toContain('pull-request')
    const dev = devTeammateRules('/bin', 'develop')
    expect(dev).toContain('`/bin/land.sh -b develop -m')
    expect(dev).toContain('first load the `better-tasks:pull-request` skill: it opens the PR')
    expect(dev).not.toContain('task_pr.py open')
    expect(teammateRules('worktree-prs', '/bin', 'dev', 'PR RULES')).toBe('PR RULES')
  })

  test("the pull-request skill reads its flow's part and the description rule, in the request-why-solution order", () => {
    const dev = prSkillSettings('dev-prs', 'develop', prBodyRules())
    expect(dev).toMatch(/^- Git flow: shared dev branch `develop`: follow "Shared dev branch"\.\n- The PR's description/)
    expect(prSkillSettings('worktree-prs', 'dev', 'BODY')).toBe('- Git flow: worktree and PR per task: follow "Worktree and PR per task".\nBODY')
    expect(prSkillSettings('direct', 'dev', '')).toContain('this project has no PRs')
    const order = ['## Asked for', '## Why', 'the video', '## What changed', '## To test', '## Commits'].map(part => dev.indexOf(part))
    expect(order.every((at, index) => at > 0 && (index === 0 || at > order[index - 1]!))).toBe(true) // the request, why, the solution, then the rest
  })

  test("the dev flow's lead rules take the PR flow's Finishing line as it is", () => {
    const pr = '## Pull request per task (on)\n- A finished task\'s notes hold "PR: <url>". Show it.\n- Mark as resolved: merge.'
    const lead = devLeadRules('/bin', 'dev', pr)
    expect(lead).toContain('- A finished task\'s notes hold "PR: <url>". Show it.')
    expect(lead).not.toContain('- Mark as resolved: merge.')
    expect(lead).toContain('python3 /bin/task_pr.py sync')
  })
})

const dir = (name: string): FsEntry => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })
const file = (name: string): FsEntry => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })

function probeOf(lists: Record<string, FsEntry[]>, ran: string[][], remotes: string, shortlog: string, du?: string): Probe {
  return {
    root: '/p',
    run: async argv => {
      ran.push(argv)
      if (argv[0] === 'git') return argv[1] === 'remote' ? remotes : shortlog
      return du
    },
    list: async path => {
      const found = lists[path]
      if (!found) throw new Error('ENOENT')
      return found
    },
    read: async path => (path.endsWith('pr.yml') ? 'on:\n  pull_request:\n' : 'on: release'),
  }
}

const GITHUB = 'origin\tgit@github.com:me/app.git (fetch)\n'
const TWO_PEOPLE = '   10\tMe <me@x>\n    3\tYou <you@x>\n'

describe('looking at a project', () => {
  test('one look: remote, people, an app two levels down, CI on PRs; no du when an app decides', async () => {
    const lists: Record<string, FsEntry[]> = {
      '/p': [dir('apps'), dir('.github'), dir('node_modules'), file('package.json')],
      '/p/apps': [dir('ios')],
      '/p/apps/ios': [dir('App.xcodeproj')],
      '/p/.github/workflows': [file('pr.yml'), file('release.yml')],
    }
    const ran: string[][] = []
    expect(await lookAt(probeOf(lists, ran, GITHUB, '   10\tMe <me@x>\n'))).toEqual({ hasGitHub: true, cacheMb: 0, app: 'an Xcode app', authors: 1, prChecks: true })
    expect(ran.some(argv => argv[0] === 'du')).toBe(false)
  })

  test('a team and no app: the caches one and two levels down are measured', async () => {
    const lists: Record<string, FsEntry[]> = { '/p': [dir('web'), dir('node_modules')], '/p/web': [dir('server')], '/p/web/server': [dir('target')] }
    const ran: string[][] = []
    const facts = await lookAt(probeOf(lists, ran, GITHUB, TWO_PEOPLE, '2097152\t/p/node_modules\n1048576\t/p/web/server/target\n'))
    expect(facts.cacheMb).toBe(3072)
    expect(ran).toContainEqual(['du', '-sk', '/p/node_modules', '/p/web/server/target'])
  })

  test('du out of time: the cache counts as too big to measure', async () => {
    const lists: Record<string, FsEntry[]> = { '/p': [dir('target')] }
    expect((await lookAt(probeOf(lists, [], GITHUB, TWO_PEOPLE, undefined))).cacheMb).toBeUndefined()
  })
})
