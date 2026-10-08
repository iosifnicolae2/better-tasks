import { describe, expect, test } from 'claude-code/testing'

import { resolvedIn } from '../hooks/coordinator'
import { GIT_FLOWS } from '../hooks/gitflow'
import { NO_FACTS, RULE_FILES, renderRule, rulesChangedNote, varsOf } from '../hooks/rules'
import type { Facts } from '../hooks/rules'
import { settingsOf } from '../hooks/settings'
import { overLimit } from '../hooks/team'
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
        const values = { gitFlow, demoVideos: flag, offScreen: !flag, escalate: flag, batchDeviceTests: flag, liveReview: flag, testScreen: flag ? 'virtual' : 'DELL' }
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

  test('batched device tests: on by default, an instance per task first, a shared build with a flag only for a risky change, flags removed once confirmed; off, neither line', async () => {
    expect(settingsOf({}).batchDeviceTests).toBe(true)
    const lead = await rule('lead.md')
    expect(lead).toContain('give each task its own instance (simulator, emulator, app copy, test user) and test them in parallel')
    expect(lead).toContain('low-risk changes as they are; one that must be tested on its own, or may clash with another, behind its own short-lived feature flag')
    expect(lead).toContain('its flag and the old path come out before it closes')
    expect(await rule('teammate.md')).toContain('and the lead asks for a feature flag? One for your change, off by default')
    expect(await rule('lead.md', { batchDeviceTests: false })).not.toContain('feature flag')
    expect(await rule('teammate.md', { batchDeviceTests: false })).not.toContain('feature flag')
  })

  test('batched testing: owners capture "before", one tester records each "after" and notes bugs, owners combine and finish; off, no tester', async () => {
    const lead = await rule('lead.md', { demoVideos: true })
    expect(lead).toContain('then one tester (named "batch-testing", told to load `better-tasks:tester`, given the task files) runs the build once, tests every task in it, records each "after" and writes the bugs it finds into the task files.')
    expect(lead).toContain('Each owner then fixes its bugs, combines its "before" with the tester\'s "after" and finishes as usual.')
    const teammate = await rule('teammate.md', { demoVideos: true })
    expect(teammate).toContain('Your task in a batch with a tester? Capture your "before", make your change, and write in your task file what to check; the tester records your "after" and notes any bugs there.')
    expect(teammate).toContain('make your video from your "before" and its "after", and go on with your PR.')
    expect(await rule('video.md')).toContain('In a batch, the tester records your AFTER')
    expect(await rule('teammate.md', { demoVideos: false })).not.toContain('records your "after"')
    const tester = await rule('tester.md', { demoVideos: true })
    expect(tester).toContain('You test; the owners fix.')
    expect(tester).toContain('First set up your own optimized test environment, once, and reuse it for the whole batch')
    expect(tester).toContain('One full go: run the shared build once and test every task in it as a user would')
    expect(tester).toContain('A bug goes in that task\'s file: what, how to see it again, a capture.')
    expect(tester).toContain("Don't change code")
    expect(tester).toContain('Once the whole batch is tested, tell each owner')
    for (const name of ['lead.md', 'teammate.md', 'video.md'] as const) expect(await rule(name, { batchDeviceTests: false, demoVideos: true })).not.toContain('tester')
  })

  test('team size: 5 by default; the lead groups similar tasks onto one teammate and spawns only under the limit; 0: no limit', async () => {
    expect(settingsOf({}).maxTeammates).toBe(5)
    const lead = await rule('lead.md')
    expect(lead).toContain('Group similar or related tasks onto one teammate, one after another: a teammate may own several.')
    expect(lead).toContain('only while the team is under 5; at the limit, queue the task with a fitting owner or wait for one to finish.')
    expect(lead).not.toContain('A few teammates at once')
    expect(await rule('lead.md', { maxTeammates: 0 })).not.toContain('at the limit')
    expect(overLimit([], 'cart', 0, [])).toBeUndefined()
  })

  test("the lead messages and wakes only this session's team; another session only when the user names it", async () => {
    expect(await rule('lead.md')).toContain("Your team is this session's teammates (team_status): message and wake only them.")
    expect(await rule('status-check.md')).toContain("an idle teammate of this session's team (team_status)")
  })

  test('efficient tooling and event-driven waiting for teammates; the lead waits on events too and spawns only when a teammate pays its start-up cost', async () => {
    const teammate = await rule('teammate.md')
    expect(teammate).toContain('the full suite at the finish. Doing something more than once? Make it a small script or CLI of your own and reuse it.')
    expect(teammate).toContain('- Wait for an event, not a clock: run long jobs in the background and act on their notice, give each command a fitting timeout, and send independent calls together in one message.')
    expect(teammate.match(/Keep the loop fast/g)).toHaveLength(1)
    const lead = await rule('lead.md')
    expect(lead).toContain("- Wait for an event, not a clock: a teammate's message or a background job's notice wakes you.")
    expect(lead).toContain('- A new teammate costs about 50k tokens to start, so route work to the ones you have')
    expect(lead).toContain('only when that pays: a new area, or a worn-out owner')
    expect(lead.match(/Group similar/g)).toHaveLength(1)
  })

  test('similar tasks can share one PR and one video: one question for it, naming every task, and each one closed on the yes', async () => {
    const lead = await rule('lead.md', { demoVideos: true })
    expect(lead).toContain('Ask the user about one PR at a time, once its video is in it, never two PRs in one ask')
    expect(lead).toContain('Similar tasks sharing one PR: one question that starts with every id, "<id>, <id> (#<PR number>): …".')
    expect(lead).toContain('close the task (each task of a shared PR)')
    expect(await rule('teammate.md')).toContain('- Similar tasks of yours can share one PR and one video (`better-tasks:pull-request`).')
    const pr = await rule('pull-request.md', { demoVideos: true })
    expect(pr).toContain("`open <id> <id> --title <words>` opens one PR for them all, with the first one's video; `close` takes the same ids.")
    expect(pr).toContain('`open` notes "PR: <url>", and the video when there is none, in each task file.')
    expect(await rule('video.md')).toContain('Tasks sharing one PR share one video, named for the first.')
    const answers = { 'T-004, T-005 (#60): rounded both totals. Is everything OK?': 'Mark as resolved', 'T-007 (#61): fixed the footer, after T-004. OK?': 'Mark as resolved', 'T-009 (#62): x': 'Request changes' }
    expect(resolvedIn(answers, 'T-')).toEqual(['T-004', 'T-005', 'T-007'])
    expect(resolvedIn({ 'T-001 Fix login\nWhat changed: T-002 too.': 'Mark as resolved' }, 'T-')).toEqual(['T-001'])
  })

  test('caches: the lead acts on an idle teammate before its cache runs out, or keeps a waiting one warm with a short note; a finished one is stopped; the teammate does not sit idle', async () => {
    expect(await rule('lead.md')).toContain('answer, route or unblock it promptly. One waiting on the user, for an approval say, gets a one-line note shortly before, to keep it warm; one whose task is closed is stopped instead.')
    expect(await rule('teammate.md')).toContain("Don't sit idle mid-task: keep going, and report promptly")
    expect(await rule('status-check.md')).toContain("act on an idle teammate of this session's team (team_status) whose cache expires soon (or send it a one-line note)")
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

  test('labels and dependencies: set when a task is filed; work starts by them, in parallel or in a chain, and the status check follows them', async () => {
    const lead = await rule('lead.md')
    expect(lead).toContain('Give it labels (its feature or area) and dependsOn: the tasks, or labels, it must wait for (same files or area, needs their result, ships after them).')
    expect(lead).toContain('- Start a task only once its dependencies are done ("waits on" marks the others): independent tasks in parallel, dependent ones one after another, never two teammates on the same files. When a task closes, start what it unblocked.')
    expect(await rule('status-check.md')).toContain('start what is next whose dependencies are done')
  })

  test("the teammate's git part follows the flow and its worktree", async () => {
    const direct = await rule('teammate.md', { gitFlow: 'direct' })
    expect(direct).toContain('on main. Commit only your own files with `/p/bin/land.sh` (--help)')
    expect(direct).toContain('Open your draft PR (`better-tasks:pull-request`)')
    expect(await rule('teammate.md', { gitFlow: 'dev-prs', devBranch: 'develop' })).toContain('on `develop`.')
    const worktree = await rule('teammate.md', { gitFlow: 'direct' }, { isWorktree: true })
    expect(worktree).toContain('`better-tasks:pull-request`')
    expect(worktree).toContain('keep to it yourself: start each command with `cd <your worktree> && `')
    expect(worktree).toContain("Reuse the main checkout's build caches")
    expect(worktree).not.toContain('land.sh')
    expect(direct).not.toContain("Reuse the main checkout's build caches")
    expect(direct).toContain('Keep the loop fast')
  })

  test('worktrees without the sandbox, the default: the teammate keeps to its worktree by its rules; with it, the plain-commands rule', async () => {
    expect(settingsOf({}).worktreeSandbox).toBe(false)
    const own = await rule('teammate.md', {}, { isWorktree: true, ownWorktree: { path: '/r/.claude/worktrees/auth', branch: 'worktree-auth' } })
    expect(own).toContain('Your own worktree `/r/.claude/worktrees/auth`, on branch `worktree-auth`, and a PR that merges into main. No check holds you in it')
    expect(own).toContain('start each command with `cd /r/.claude/worktrees/auth && `, and read and edit files under it. In the main checkout, edit only your task file: never commit, reset or switch branches there. Any shell form works')
    expect(own).not.toContain('must plainly stay')
    for (const sandboxed of [await rule('teammate.md', { worktreeSandbox: true }, { isWorktree: true }), await rule('teammate.md', {}, { isWorktree: true, isIsolated: true })]) {
      expect(sandboxed).toContain('gh and git commands must plainly stay in your worktree: no subshells')
      expect(sandboxed).not.toContain('No check holds you')
      expect(sandboxed).toContain("Reuse the main checkout's build caches")
    }
  })

  test('closing a task cleans up its teammate and worktree, and the status check keeps tasks current', async () => {
    for (const gitFlow of ['direct', 'worktree-prs'])
      expect(await rule('lead.md', { gitFlow })).toContain('close the task (each task of a shared PR), stop the teammate, remove its worktree and merged branch')
    expect(await rule('status-check.md', {}, { idleMinutes: 10 })).toContain('keep each task file current')
    expect(await rule('status-check.md', {}, { idleMinutes: 10 })).toContain('a task whose PR is closed or merged: close it')
    expect(await rule('teammate.md')).toContain('kept current at each step')
  })

  test('a teammate below the hard level, with escalation on, reports being stuck', async () => {
    expect(await rule('teammate.md')).toContain('Not getting there?')
    expect(await rule('teammate.md', {}, { isHard: true })).not.toContain('Not getting there')
    expect(await rule('teammate.md', { escalate: false })).not.toContain('Not getting there')
  })

  test('the skills follow the settings: quality, off-screen, the test screen, the PR flow, the upstream answer', async () => {
    expect(await rule('video.md', { videoQuality: 'low' })).toContain('--quality low')
    expect(await rule('video.md', {})).toContain('Never show secrets or personal data')
    expect(await rule('pull-request.md', {})).toContain('No secrets or personal data')
    expect(await rule('testing.md', { offScreen: true })).toContain("the project's own virtual display")
    expect(await rule('testing.md', { offScreen: true })).toContain('it makes the display when there is none and keeps it')
    expect(await rule('testing.md', { offScreen: true })).toContain("off the user's screen")
    expect(await rule('testing.md', { offScreen: false, testScreen: 'DELL' })).toContain('"DELL"')
    expect(await rule('testing.md', { offScreen: false })).not.toContain("off the user's screen")
    expect(await rule('pull-request.md', { gitFlow: 'dev-prs' })).toContain('task_pr.py open <id> --body-file')
    expect(await rule('pull-request.md', { gitFlow: 'worktree-prs' })).toContain('open again with --ready')
    expect(await rule('contribute.md', {}, { upstreamPr: 'never' })).toContain("don't ask")
    expect(await rule('contribute.md')).toContain('`sh <fork>/scripts/test.sh`')
    expect(await rule('done.md', { gitFlow: 'worktree-prs' })).toContain('then your PR marked ready (`better-tasks:pull-request`)')
  })

  test('every approval links the PR, its video inside, and the release when the task changes one; under every flow', async () => {
    for (const gitFlow of GIT_FLOWS) {
      const lead = await rule('lead.md', { gitFlow, demoVideos: true })
      expect(lead).toContain('It opens its PR as a draft, the video in it')
      expect(lead).toContain('Ask the user about one PR at a time, once its video is in it, never two PRs in one ask')
      expect(lead).toContain('Its PR link (and its release\'s, if any) goes in as above: header "<id> (#<PR number>)", "<id> (#<PR number>): <what it implemented or fixed, in a few words>. PR: <url>. Is everything OK?"')
      expect(lead).toContain('a draft release, the release video in its notes')
      const done = await rule('done.md', { gitFlow })
      expect(done).toContain('PR: <url>\nRelease: <url, only when your task changes a release>')
      expect(done).toContain('"<id> done: <PR url>, see <task file>"')
    }
    const direct = await rule('lead.md', { gitFlow: 'direct' })
    expect(direct).toContain('for review only')
    expect(direct).toContain("its review PR closed. Then, in one go: close the task")
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
