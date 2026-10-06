import { describe, expect, test } from 'claude-code/testing'

import { GIT_FLOWS } from '../hooks/gitflow'
import { NO_FACTS, RULE_FILES, renderRule, rulesChangedNote, varsOf } from '../hooks/rules'
import type { Facts } from '../hooks/rules'
import { settingsOf } from '../hooks/settings'
import { changedSections, render, sectionsOf, templateOf } from '../hooks/template'
import type { Sources } from '../hooks/template'
import { starterFiles } from '../hooks/texts'
import { TEMPLATES } from './templates.gen'

const plugin = (name: string) => Promise.resolve(TEMPLATES[name])
const shipped: Sources = { plugin, project: async () => undefined }
const withProject = (files: Record<string, string>): Sources => ({ plugin, project: async path => files[path] })

/** One instruction file, rendered from the shipped templates with these settings and facts. */
function rule(name: (typeof RULE_FILES)[number], values: Record<string, unknown> = {}, facts: Partial<Facts> = {}): Promise<string> {
  return renderRule(name, shipped, varsOf(settingsOf(values), { ...NO_FACTS, pluginRoot: '/p', ...facts }))
}

describe('the template syntax', () => {
  test('values, if, elif, else; a line holding only a tag leaves nothing behind', () => {
    const template = 'A {{ x }}.\n{% if on %}\nOn.\n{% elif flow == "dev" %}\nDev.\n{% else %}\nOff.\n{% endif %}\nEnd.'
    expect(render(template, { x: 1, on: true, flow: 'dev' })).toBe('A 1.\nOn.\nEnd.')
    expect(render(template, { x: 1, on: false, flow: 'dev' })).toBe('A 1.\nDev.\nEnd.')
    expect(render(template, { x: 1, on: false, flow: 'direct' })).toBe('A 1.\nOff.\nEnd.')
  })

  test('inline tags, not, and, or, !=; nested ifs inside a hidden one stay hidden', () => {
    expect(render('x{% if not a and b %}y{% endif %}z', { a: false, b: true })).toBe('xyz')
    expect(render('{% if a or f != "x" %}y{% endif %}', { a: false, f: 'x' })).toBe('')
    expect(render('{% if a %}{% if b %}in{% else %}else{% endif %}{% endif %}.', { a: false, b: false })).toBe('.')
  })

  test('comments are for people; an unknown name or an open if is an error', () => {
    expect(render('<!-- note {{ nope }} -->\nText.', {})).toBe('Text.')
    expect(() => render('{{ nope }}', {})).toThrow('unknown name "nope"')
    expect(() => render('{% if a %}x', { a: true })).toThrow('no {% endif %}')
  })
})

describe('project overrides', () => {
  const shippedText = async (files: Record<string, string>) => templateOf('lead.md', withProject(files))

  test('none: the plugin text; the same file (better-tasks itself): no double', async () => {
    expect(await shippedText({})).toBe(TEMPLATES['lead.md']!)
    expect(await shippedText({ '.claude/better-tasks/lead.md': TEMPLATES['lead.md']! })).toBe(TEMPLATES['lead.md']!)
  })

  test('a file of the same name extends by default, replaces with "replace: true"', async () => {
    expect(await shippedText({ '.claude/better-tasks/lead.md': 'Also mine.' })).toBe(`${TEMPLATES['lead.md']!.trimEnd()}\n\nAlso mine.`)
    expect(await shippedText({ '.claude/better-tasks/lead.md': '---\nreplace: true\n---\nOnly mine.' })).toBe('Only mine.')
  })

  test('@/ pulls in the plugin file, @./ a project file', async () => {
    const own = '---\nreplace: true\n---\nFirst.\n@/status-check.md\n@./docs/rules.md\nLast.'
    const text = await shippedText({ '.claude/better-tasks/lead.md': own, 'docs/rules.md': 'Our rules.' })
    expect(text).toBe(`First.\n${TEMPLATES['status-check.md']!.trimEnd()}\nOur rules.\nLast.`)
  })

  test('the starter files change nothing until written in', async () => {
    const starter = starterFiles()['.claude/better-tasks/lead.md']!
    const vars = varsOf(settingsOf({}), NO_FACTS)
    expect(render(await shippedText({ '.claude/better-tasks/lead.md': starter }), vars)).toBe(render(TEMPLATES['lead.md']!, vars))
  })
})

describe('the shipped templates', () => {
  test('every file renders under every git flow, videos, off-screen and model setting, with no tag left', async () => {
    for (const gitFlow of GIT_FLOWS) {
      for (const flag of [true, false]) {
        const values = { gitFlow, demoVideos: flag, offScreen: !flag, escalate: flag, testScreen: flag ? 'virtual' : 'DELL' }
        for (const name of RULE_FILES) {
          for (const facts of [{ isWorktree: flag, isHard: flag, hasTypes: flag, hasOwnPrTemplate: flag, upstreamPr: flag ? 'ask' : 'never' }]) {
            const text = await rule(name, values, facts)
            expect(text).not.toMatch(/\{[{%]|[}%]\}/)
            expect(text.length).toBeGreaterThan(50)
          }
        }
      }
    }
  })

  test('the lead: the task scenario, the status check every few minutes, the video before the question, tests and PR after the yes', async () => {
    const lead = await rule('lead.md', { demoVideos: true, gitFlow: 'worktree-prs', statusEvery: 10 })
    expect(lead).toContain('## How a task goes')
    expect(lead).toContain('the video is the functional test')
    expect(lead).toContain('Every 10 quiet minutes')
    expect(lead).toContain('"<id> accepted: finish it": the full tests, then its PR')
    expect(lead).toContain('`better-tasks:teammate-normal` (opus at medium effort)')
    expect(await rule('lead.md', { escalate: false })).not.toContain('a level up')
  })

  test('new bugs: small ones fixed in the task; bigger or other-area ones asked as a new task, fixed with a video and a PR; straight to main gets its own worktree', async () => {
    const direct = await rule('lead.md', { gitFlow: 'direct', demoVideos: true })
    expect(direct).toContain('A teammate fixes a small bug in its own area within its task.')
    expect(direct).toContain('"New bug: <what>. Make it a new task?", options "New task" and "Skip"')
    expect(direct).toContain('fixed the same way, with a video and a PR the user sees before it merges')
    expect(await rule('lead.md', { demoVideos: false })).toContain('fixed the same way, with a PR the user sees')
    expect(direct).toContain('spawn its teammate with isolation "worktree"')
    expect(await rule('lead.md', { gitFlow: 'dev-prs' })).toContain("is fixed on that task's branch")
    const teammate = await rule('teammate.md')
    expect(teammate).toContain('and so is a small one in your area: fix it, and say so in your notes and PR.')
    expect(teammate).toContain('A bigger one, or one in another area: don\'t fix it; capture it and tell the lead: "New bug: <what>, <how to see it again>, BEFORE: <path>"')
    expect(await rule('done.md')).toContain('a small bug you fixed on the way')
  })

  test('wherever the user reads a task, it is named by its id and PR number, "T-078 (#43)": questions and their headers, status lines, the block the user sees', async () => {
    const lead = await rule('lead.md')
    expect(lead).toContain('- Wherever the user reads a task (your text, questions, their headers and options, status lines, release notes), name it by its id, with its PR number once it has one: "T-078 (#43)", else "T-078".')
    expect(lead).toContain('header "<id> (#<PR number>)", "<id> (#<PR number>): <what it implemented or fixed, in a few words>. PR: <url>. Is everything OK?"')
    expect(await rule('status-check.md')).toContain('each task by its id and PR number ("T-078 (#43)")')
    const done = await rule('done.md')
    expect(done).toContain('### For the user\nPR: <url>\nRelease: <url, only when your task changes a release>\n<id> (#<PR number>) <title>')
    expect(done).toContain('the ones a release ships too, goes the same way: "T-078 (#43)"')
  })

  test("the teammate's git part follows the flow and its worktree", async () => {
    const direct = await rule('teammate.md', { gitFlow: 'direct' })
    expect(direct).toContain('on main. Commit only your own files with `/p/bin/land.sh` (--help)')
    expect(direct).toContain('Open your draft PR (`better-tasks:pull-request`)')
    expect(await rule('teammate.md', { gitFlow: 'dev-prs', devBranch: 'develop' })).toContain('on `develop`.')
    const worktree = await rule('teammate.md', { gitFlow: 'direct' }, { isWorktree: true })
    expect(worktree).toContain('`better-tasks:pull-request`')
    expect(worktree).toContain('must plainly stay in your worktree')
    expect(worktree).not.toContain('land.sh')
  })

  test('a teammate below the hard level, with escalation on, reports being stuck', async () => {
    expect(await rule('teammate.md')).toContain('Not getting there?')
    expect(await rule('teammate.md', {}, { isHard: true })).not.toContain('Not getting there')
    expect(await rule('teammate.md', { escalate: false })).not.toContain('Not getting there')
  })

  test('the skills follow the settings: quality, off-screen, the test screen, the PR flow, the upstream answer', async () => {
    expect(await rule('video.md', { videoQuality: 'low' })).toContain('--quality low')
    expect(await rule('testing.md', { offScreen: true })).toContain("the project's own virtual display")
    expect(await rule('testing.md', { offScreen: true })).toContain("off the user's screen")
    expect(await rule('testing.md', { offScreen: false, testScreen: 'DELL' })).toContain('"DELL"')
    expect(await rule('testing.md', { offScreen: false })).not.toContain("off the user's screen")
    expect(await rule('pull-request.md', { gitFlow: 'dev-prs' })).toContain('task_pr.py open <id> --body-file')
    expect(await rule('pull-request.md', { gitFlow: 'worktree-prs' })).toContain('open again with --ready')
    expect(await rule('contribute.md', {}, { upstreamPr: 'never' })).toContain("don't ask")
    expect(await rule('done.md', { gitFlow: 'worktree-prs' })).toContain('then your PR marked ready (`better-tasks:pull-request`)')
  })

  test('every approval links the PR, its video inside, and the release when the task changes one; under every flow', async () => {
    for (const gitFlow of GIT_FLOWS) {
      const lead = await rule('lead.md', { gitFlow, demoVideos: true })
      expect(lead).toContain('It opens its PR as a draft, the video in it')
      expect(lead).toContain('Ask the user about one task at a time, once its video is in its PR: one question, never two tasks in it or two questions at once')
      expect(lead).toContain('Its PR link (and its release\'s, if any) goes in your text just above the question and again inside it: header "<id> (#<PR number>)", "<id> (#<PR number>): <what it implemented or fixed, in a few words>. PR: <url>. Is everything OK?"')
      expect(lead).toContain('a draft release, the release video in its notes')
      const done = await rule('done.md', { gitFlow })
      expect(done).toContain('PR: <url>\nRelease: <url, only when your task changes a release>')
      expect(done).toContain('"<id> done: <PR url>, see <task file>"')
    }
    const direct = await rule('lead.md', { gitFlow: 'direct' })
    expect(direct).toContain('for review only')
    expect(direct).toContain("its review PR closed. Then close the task")
    expect(await rule('pull-request.md', { gitFlow: 'direct' })).toContain('`task_pr.py close <id>`')
    expect(await rule('pull-request.md', { gitFlow: 'direct' }, { isWorktree: true })).not.toContain('review only')
    expect(await rule('lead.md', { gitFlow: 'dev-prs' })).toContain('its PR marked ready. Merge once its checks pass')
  })

  test('the status check says how long it was quiet', async () => {
    expect(await rule('status-check.md', {}, { idleMinutes: 12 })).toContain('no activity for 12 min')
  })
})

describe('a setting changed mid-session', () => {
  test('only the changed sections are sent, and the ones dropped are named', () => {
    const before = '# Rules\nIntro.\n\n## A\nOne.\n\n## B\nTwo.\n\n## C\nThree.'
    const now = '# Rules\nIntro.\n\n## A\nOne.\n\n## B\nTwo, changed.'
    expect([...sectionsOf(before).keys()]).toEqual(['', '## A', '## B', '## C'])
    expect(changedSections(before, now)).toEqual({ changed: ['## B\nTwo, changed.'], dropped: ['## C'] })
  })

  test("the note gives the lead its sections, and its running teammates' to send", () => {
    const note = rulesChangedNote({ changed: ['## Git flow\nNew.'], dropped: [] }, { changed: ['## Git\nNew too.'], dropped: ['## Old'] })
    expect(note).toContain('replace the ones with the same heading')
    expect(note).toContain('## Git flow\nNew.')
    expect(note).toContain('Send each running teammate')
    expect(note).toContain('No longer in force: ## Old.')
  })
})
