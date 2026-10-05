import { describe, expect, test } from 'claude-code/testing'

import { ghProblem, ghUpdateVerdict, hasGitHub, PR_COORDINATOR_RULES, PR_TEAMMATE_RULES } from '../hooks/pullrequest'
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

  test("the gh update's last line says how it went, checked against the version it reports", () => {
    expect(ghUpdateVerdict('==> Upgrading gh\nready gh version 2.102.0 (2026-09-30)\n')).toEqual({ isReady: true, text: 'GitHub CLI updated (2.102.0): PRs carry their video.' })
    expect(ghUpdateVerdict('login gh version 2.102.0 (2026-09-30)')).toEqual({ isReady: false, text: 'GitHub CLI updated (2.102.0): PRs carry their video. Sign in once: gh auth login.' })
    expect(ghUpdateVerdict('failed: no Homebrew to update gh with; update it by hand: https://github.com/cli/cli#installation').text)
      .toBe('better-tasks: failed: no Homebrew to update gh with; update it by hand: https://github.com/cli/cli#installation. PRs still work, without the video.')
    expect(ghUpdateVerdict('ready gh version 2.98.0 (2026-08-20)').isReady).toBe(false) // another, older gh comes first on PATH
    expect(ghUpdateVerdict('').isReady).toBe(false)
  })

  test('a PR needs a GitHub remote, over ssh or https', () => {
    expect(hasGitHub('origin\tgit@github.com:someone/app.git (fetch)')).toBe(true)
    expect(hasGitHub('origin\thttps://github.com/someone/app.git (push)')).toBe(true)
    expect(hasGitHub('origin\tgit@gitlab.com:someone/app.git (fetch)')).toBe(false)
    expect(hasGitHub('')).toBe(false)
  })

  test('with a PR the approval question shows only the PR link: its picture opens the video', () => {
    expect(PR_COORDINATOR_RULES).toContain("and no video link: the PR's picture opens the video")
  })

  test("the PR shows the video's poster linking to the video, with a text line so GitHub keeps it a picture", () => {
    expect(PR_TEAMMATE_RULES).toContain("`[![Before/after video: click to play it with sound](<poster's absolute path>)](<video's absolute path>)`\n  `Click the picture to play the video with sound (Cmd-click or Ctrl-click: in a new tab).`")
    expect(PR_TEAMMATE_RULES).toContain("--attach <poster's absolute path> --attach <video's absolute path>")
    expect(PR_TEAMMATE_RULES).toContain('--attach <poster> --attach <video>')
  })
})
