import type { FsEntry } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { instructionLines, instructionsBlock, pathsOf, summaryOf } from '../hooks/instructions'
import type { Reader } from '../hooks/instructions'

const WORKFLOW = `# Workflow: one checkout, \`dev\` on the devices, a pull request per task

**In one line:** where a commit lands (\`dev\`), how a task becomes a pull request.

## The three lines
`

const file = (name: string): FsEntry => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })

function reader(files: Record<string, string>, folders: Record<string, FsEntry[]> = {}): Reader {
  return { root: '/p', read: async path => files[path], list: async path => folders[path] }
}

describe('project instructions', () => {
  test('paths: comma-separated, trailing slashes dropped', () => {
    expect(pathsOf(' docs/rig/workflow.md, docs/rules/ ,')).toEqual(['docs/rig/workflow.md', 'docs/rules'])
    expect(pathsOf('')).toEqual([])
  })

  test("a file's line: its title and the first line of text after it, never the whole file", () => {
    expect(summaryOf(WORKFLOW)).toBe('Workflow: one checkout, `dev` on the devices, a pull request per task: In one line: where a commit lands (`dev`), how a task becomes a pull request.')
    expect(summaryOf('---\nid: 1\n---\n<!-- note -->\nJust text.\n')).toBe('Just text.')
    expect(summaryOf(`# T\n${'x'.repeat(400)}`).length).toBe(200)
  })

  test('a file and a folder: one line each, a folder lists its .md files; a missing path is reported apart', async () => {
    const found = await instructionLines(
      reader({ '/p/docs/rig/workflow.md': WORKFLOW, '/p/docs/rules/a.md': '# Rule A\nDo a.', '/p/docs/rules/b.md': '# Rule B' }, { '/p/docs/rules': [file('b.md'), file('a.md'), file('x.png')] }),
      'docs/rig/workflow.md, docs/rules/, docs/gone.md',
    )
    expect(found.lines).toEqual([
      '- docs/rig/workflow.md: Workflow: one checkout, `dev` on the devices, a pull request per task: In one line: where a commit lands (`dev`), how a task becomes a pull request.',
      '- docs/rules/: 2 files',
      '  - docs/rules/a.md: Rule A: Do a.',
      '  - docs/rules/b.md: Rule B',
    ])
    expect(found.missing).toEqual(['docs/gone.md'])
  })

  test('no paths, no block', () => {
    expect(instructionsBlock([])).toBe('')
    expect(instructionsBlock(['- a.md: A'])).toMatch(/^## Project instructions\n.*\n- a\.md: A$/)
  })
})
