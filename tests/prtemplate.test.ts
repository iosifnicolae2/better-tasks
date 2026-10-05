import type { FsEntry } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { prBodyRules } from '../hooks/gitflow'
import { findPrTemplate, shippedTemplate, shownPath } from '../hooks/prtemplate'

const file = (name: string): FsEntry => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })

function reader(paths: string[]) {
  const has = new Set(paths)
  return {
    read: async (path: string) => (has.has(path) ? 'text' : Promise.reject(new Error('missing'))),
    list: async (folder: string) => {
      const names = paths.filter(path => path.startsWith(`${folder}/`)).map(path => path.slice(folder.length + 1))
      return names.length > 0 ? names.map(file) : Promise.reject(new Error('missing'))
    },
  }
}

const find = (paths: string[], custom = '') => findPrTemplate(reader(paths), '/p', custom, '/plugin')

describe('the PR template', () => {
  test("none in the project: better-tasks' own, never added to the repo", async () => {
    expect(await find([])).toEqual({ path: shippedTemplate('/plugin'), source: 'shipped' })
  })

  test("the project's own, where GitHub looks, in GitHub's order", async () => {
    expect(await find(['/p/docs/pull_request_template.md', '/p/.github/pull_request_template.md'])).toEqual({ path: '/p/.github/pull_request_template.md', source: 'project' })
    expect((await find(['/p/PULL_REQUEST_TEMPLATE.md'])).path).toBe('/p/PULL_REQUEST_TEMPLATE.md')
  })

  test("a folder of templates (GitHub's, GitLab's): its default.md, else the first", async () => {
    expect((await find(['/p/.github/PULL_REQUEST_TEMPLATE/feature.md', '/p/.github/PULL_REQUEST_TEMPLATE/bug.md'])).path).toBe('/p/.github/PULL_REQUEST_TEMPLATE/bug.md')
    expect((await find(['/p/.gitlab/merge_request_templates/a.md', '/p/.gitlab/merge_request_templates/Default.md'])).path).toBe('/p/.gitlab/merge_request_templates/Default.md')
  })

  test('a custom path wins; one that is not there is said, and the others are used', async () => {
    const paths = ['/p/.github/pull_request_template.md', '/p/team/pr.md']
    expect(await find(paths, 'team/pr.md')).toEqual({ path: '/p/team/pr.md', source: 'custom' })
    expect(await find(paths, 'gone.md')).toEqual({ path: '/p/.github/pull_request_template.md', source: 'project', missing: 'gone.md' })
    expect(shownPath({ path: '/p/team/pr.md', source: 'custom' }, '/p')).toBe('team/pr.md')
  })

  test("the rules: the project's template filled in, the request and why on top, then the video", () => {
    const rules = prBodyRules({ path: '/p/.github/pull_request_template.md', source: 'project' })
    expect(rules).toContain("fills in this project's template, `/p/.github/pull_request_template.md`")
    const order = ['the user\'s request', 'why it was needed', 'the video', '"## Commits"'].map(part => rules.indexOf(part))
    expect(order.every((at, index) => at > 0 && (index === 0 || at > order[index - 1]!))).toBe(true)
    expect(rules).toContain('Never add a template to the repo yourself')
    expect(prBodyRules({ path: '/plugin/templates/pull_request_template.md', source: 'shipped' })).toContain("better-tasks' template (`/plugin/templates/pull_request_template.md`; this project has none of its own)")
  })
})
