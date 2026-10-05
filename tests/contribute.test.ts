import { describe, expect, test } from 'claude-code/testing'

import { contributeRules, readUpstreamPr, saveUpstreamPr, upstreamPrOf, userFile } from '../hooks/contribute'

function memoryFiles(start: Record<string, string> = {}) {
  const disk = { ...start }
  return {
    disk,
    read: async (path: string) => {
      if (!(path in disk)) throw new Error('missing')
      return disk[path] as string
    },
    write: async (path: string, text: string) => {
      disk[path] = text
    },
  }
}

const DIR = '/home/me/.claude'

describe('changes to better-tasks itself', () => {
  test('the rules say fork, change, linked install, then the PR question', () => {
    const rules = contributeRules('ask')
    expect(rules).toContain('gh repo fork iosifnicolae2/better-tasks --clone')
    expect(rules).toContain('CLAUDE_CODE_PLUGIN_DIRS')
    expect(rules).toContain('/reload-plugins')
    expect(rules).toContain('"Yes, open a PR"')
    expect(rules).toContain('"Not now"')
    expect(rules).toContain('"Never"')
  })

  test('after "Never" the rules no longer ask', () => {
    const rules = contributeRules('never')
    expect(rules).not.toContain('AskUserQuestion')
    expect(rules).toContain('the user chose "Never"')
  })

  test('no file, or a broken one, means ask', () => {
    expect(upstreamPrOf(undefined)).toBe('ask')
    expect(upstreamPrOf('not json')).toBe('ask')
    expect(upstreamPrOf('{"upstreamPr":"never"}')).toBe('never')
  })

  test('"Never" sticks per user; "Not now" and "Yes" ask again; other keys stay', async () => {
    const files = memoryFiles({ [userFile(DIR)]: '{"other":1}' })
    expect(await readUpstreamPr(files, DIR)).toBe('ask')
    await saveUpstreamPr(files, DIR, 'never')
    expect(await readUpstreamPr(files, DIR)).toBe('never')
    expect(JSON.parse(files.disk[userFile(DIR)] as string)).toEqual({ other: 1, upstreamPr: 'never' })
    await saveUpstreamPr(files, DIR, 'not-now')
    expect(await readUpstreamPr(files, DIR)).toBe('ask')
    expect(await saveUpstreamPr(files, DIR, 'yes')).toContain('gh pr create --repo iosifnicolae2/better-tasks')
    expect(await readUpstreamPr(files, DIR)).toBe('ask')
  })

  test('an unknown answer counts as ask', async () => {
    const files = memoryFiles()
    await saveUpstreamPr(files, DIR, 'maybe')
    expect(await readUpstreamPr(files, DIR)).toBe('ask')
  })

  test('kept in the Claude Code folder, outside any project', () => {
    expect(userFile(DIR)).toBe('/home/me/.claude/better-tasks/user.json')
  })
})
