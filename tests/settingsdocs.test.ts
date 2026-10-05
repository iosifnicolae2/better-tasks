import { describe, expect, test } from 'claude-code/testing'

import { FIELDS } from '../hooks/settings'
import { docGaps, renderSkill } from '../scripts/settingsdocs'

describe('settings skill', () => {
  test('every setting in hooks/settings.ts has a line in scripts/settingsdocs.ts (then run bun scripts/settings-doc.ts)', () => {
    expect(docGaps()).toEqual({ undocumented: [], unknown: [] })
  })

  test('the skill lists every key with its default and where it is saved', () => {
    const text = renderSkill({ editor: { title: 'Editor' } })
    for (const key of Object.keys(FIELDS)) expect(text).toContain(`| \`${key}\` |`)
    expect(text).toContain('| `editor` | Opens task files')
    expect(text).toContain('| "auto" | /config "Editor" or config.json |')
    expect(text).toContain('| "direct" | config.json |')
    expect(text).toContain('`upstreamPr`')
  })

  test('starts with the front matter Claude Code loads a skill by', () => {
    expect(renderSkill({}).startsWith('---\nname: settings\ndescription: ')).toBe(true)
  })
})
