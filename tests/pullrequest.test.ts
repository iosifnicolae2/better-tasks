import { describe, expect, test } from 'claude-code/testing'

import { ghProblem } from '../hooks/pullrequest'
import { settingsOf } from '../hooks/settings'

describe('PR per task', () => {
  test('off until chosen', () => {
    expect(settingsOf({}).pullRequests).toBe(false)
    expect(settingsOf({ pullRequests: true }).pullRequests).toBe(true)
  })

  test('gh 2.99 or newer will do; older or missing gets one line saying what to run', () => {
    expect(ghProblem('gh version 2.99.0 (2026-09-01)\nhttps://github.com/cli/cli/releases/tag/v2.99.0\n')).toBeUndefined()
    expect(ghProblem('gh version 2.102.0 (2026-09-30)')).toBeUndefined()
    expect(ghProblem('gh version 3.0.0 (2027-01-01)')).toBeUndefined()
    expect(ghProblem('gh version 2.98.0 (2026-08-20)')).toBe("PR per task: gh 2.98.0 can't put the video in the PR; brew upgrade gh (2.99 or newer)")
    expect(ghProblem('gh version 1.150.0 (2020-01-01)')).toContain('brew upgrade gh')
    expect(ghProblem(undefined)).toBe('PR per task needs the GitHub CLI: brew install gh, then gh auth login')
  })
})
