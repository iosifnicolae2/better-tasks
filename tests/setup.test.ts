import { describe, expect, test } from 'claude-code/testing'

import { withoutPointer } from '../hooks/setup'

const OURS = '## Agent teams\n<!-- better-tasks -->\nWhen better-tasks is enabled, follow its coordinator and teammate rules (the plugin injects them); they take precedence over anything below about agent teams.'

describe("taking an older version's section out of the global CLAUDE.md", () => {
  test('none there: nothing to change', () => {
    expect(withoutPointer('# Me\n## Agent teams\n- Route every message.\n')).toBeUndefined()
  })

  test('our section alone, last in the file: gone with its heading', () => {
    expect(withoutPointer(`# Me\n- Be brief.\n\n${OURS}\n`)).toBe('# Me\n- Be brief.\n')
  })

  test("the user's own lines under the heading stay, with the heading", () => {
    expect(withoutPointer(`# Me\n\n${OURS}\n- Builds go to TestFlight.\n\n## Git\n- Commit often.\n`)).toBe('# Me\n\n## Agent teams\n- Builds go to TestFlight.\n\n## Git\n- Commit often.\n')
  })

  test('a reworded line under the marker: only the marker goes', () => {
    expect(withoutPointer('## Agent teams\n<!-- better-tasks -->\nFollow better-tasks.\n')).toBe('## Agent teams\nFollow better-tasks.\n')
  })
})
