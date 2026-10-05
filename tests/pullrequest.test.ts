import { describe, expect, test } from 'claude-code/testing'

import { ghProblem, ghUpdateVerdict, hasGitHub, openPrLine, prCoordinatorRules, PR_TEAMMATE_RULES } from '../hooks/pullrequest'
import { settingsOf } from '../hooks/settings'

describe('PR per task', () => {
  test('off until chosen; the old switch reads as the worktree flow', () => {
    expect(settingsOf({}).gitFlow).toBe('direct')
    expect(settingsOf({ pullRequests: true }).gitFlow).toBe('worktree-prs')
  })

  test('gh 2.99 or newer will do; older or missing gets one line saying what to run', () => {
    expect(ghProblem('gh version 2.99.0 (2026-09-01)\nhttps://github.com/cli/cli/releases/tag/v2.99.0\n')).toBeUndefined()
    expect(ghProblem('gh version 2.102.0 (2026-09-30)')).toBeUndefined()
    expect(ghProblem('gh version 3.0.0 (2027-01-01)')).toBeUndefined()
    expect(ghProblem('gh version 2.98.0 (2026-08-20)')).toBe("PR per task: gh 2.98.0 can't put the video in the PR; brew upgrade gh (2.99 or newer)")
    expect(ghProblem('gh version 1.150.0 (2020-01-01)')).toContain('brew upgrade gh')
    expect(ghProblem(undefined)).toBe('PR per task needs the GitHub CLI: brew install gh, then gh auth login')
  })

  test("the gh update's last line says how it went, checked against the version it reports", () => {
    expect(ghUpdateVerdict('==> Upgrading gh\nready gh version 2.102.0 (2026-09-30)\n')).toEqual({ isReady: true, text: 'GitHub CLI updated (2.102.0): PRs carry their video.' })
    expect(ghUpdateVerdict('login gh version 2.102.0 (2026-09-30)')).toEqual({ isReady: false, text: 'GitHub CLI updated (2.102.0): PRs carry their video. Sign in once: gh auth login.' })
    expect(ghUpdateVerdict('failed: no Homebrew to update gh with; update it by hand: https://github.com/cli/cli#installation').text)
      .toBe('better-tasks: failed: no Homebrew to update gh with; update it by hand: https://github.com/cli/cli#installation. PRs still work; their video goes on a branch.')
    expect(ghUpdateVerdict('ready gh version 2.98.0 (2026-08-20)').isReady).toBe(false) // another, older gh comes first on PATH
    expect(ghUpdateVerdict('').isReady).toBe(false)
  })

  test('a PR needs a GitHub remote, over ssh or https', () => {
    expect(hasGitHub('origin\tgit@github.com:someone/app.git (fetch)')).toBe(true)
    expect(hasGitHub('origin\thttps://github.com/someone/app.git (push)')).toBe(true)
    expect(hasGitHub('origin\tgit@gitlab.com:someone/app.git (fetch)')).toBe(false)
    expect(hasGitHub('')).toBe(false)
  })

  test('the question links the PR; "Mark as resolved" merges it with no new round', () => {
    expect(prCoordinatorRules(true, '/bin')).toContain('its question links only the PR')
    expect(prCoordinatorRules(true, '/bin')).toContain('Mark as resolved: `gh pr merge <url> --squash --delete-branch`')
    expect(prCoordinatorRules(true, '/bin')).toContain('Request changes: the teammate pushes to the same PR.')
    expect(prCoordinatorRules(true, '/bin')).toContain('gh pr merge <url> --squash --delete-branch')
  })

  test('openPrInBrowser: the lead opens the PR right before its question, never after the answer; off, it does not', () => {
    expect(prCoordinatorRules(true, '/bin')).toContain(openPrLine('/bin'))
    expect(openPrLine('/bin')).toContain('right before its question, run `/bin/open-pr.sh <url>`')
    expect(openPrLine('/bin')).toContain('Never open it again after the user\'s answer.')
    expect(openPrLine('/bin')).not.toContain('merging')
    expect(prCoordinatorRules(false, '/bin')).not.toContain('default browser')
    expect(prCoordinatorRules(false, '/bin')).toContain('gh pr merge <url> --squash --delete-branch')
  })

  test("the teammate's prompt keeps the worktree and a pointer: the how-to is the pull-request skill", () => {
    expect(PR_TEAMMATE_RULES).toContain('You work in your own git worktree')
    expect(PR_TEAMMATE_RULES).toContain('The PR opens at done, before the user is asked, with its video: the `better-tasks:pull-request` skill')
    expect(PR_TEAMMATE_RULES).not.toContain('gh pr create')
  })
})
