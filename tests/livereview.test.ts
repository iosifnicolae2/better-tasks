import { describe, expect, test } from 'claude-code/testing'

import {
  addUsage, boxOf, clockOf, costOf, instructionsOf, isChanged, isRepeat, keyArgv, keyPlaceOf, listOf, markdownOf,
  observationOf, OBSERVE_TOOL, shifted, srtOf, THUMB,
} from '../hooks/livereview'
import type { Observation, Review } from '../hooks/livereview'
import { NO_FACTS, renderRule, varsOf } from '../hooks/rules'
import { FIELDS, parseOverrides, settingsOf } from '../hooks/settings'
import type { Sources } from '../hooks/template'
import { TEMPLATES } from './templates.gen'

const shipped: Sources = { plugin: name => Promise.resolve(TEMPLATES[name]), project: async () => undefined }
const rule = (name: 'testing.md' | 'video.md', values: Record<string, unknown>) =>
  renderRule(name, shipped, varsOf(settingsOf(values), { ...NO_FACTS, pluginRoot: '/p' }))

const SIZE: [number, number] = [3840, 2160]
const flag = (at: number, text: string, extra: Partial<Observation> = {}): Observation => ({ at, kind: 'flag', severity: 'error', text, ...extra })

describe('live review: the setting', () => {
  test('off until chosen; a project may turn it on in config.json', () => {
    expect(settingsOf({}).liveReview).toBe(false)
    expect(settingsOf({ liveReview: true }).liveReview).toBe(true)
    expect(FIELDS.liveReview).toEqual({ kind: 'boolean' })
    expect(parseOverrides('{ "liveReview": true }').values).toEqual({ liveReview: true })
    expect(parseOverrides('{ "liveReview": "yes" }').problems).toEqual(['"liveReview" must be a boolean'])
  })

  test('on, the testing and video skills say how to start it and use its reports; off, not a word', async () => {
    const on = await rule('testing.md', { liveReview: true })
    expect(on).toContain('`/p/bin/live-review.sh start --watch "<what to check>"` (--help) has Gemini report what you asked and flag anything not OK, each at its second.')
    expect(on).toContain('look at each reported moment in the recording yourself')
    expect(await rule('video.md', { liveReview: true, demoVideos: true })).toContain('`"review": "<its review.json>"` shows Gemini\'s reports in the video')
    for (const name of ['testing.md', 'video.md'] as const) expect(await rule(name, {})).not.toContain('live-review')
    expect(await rule('video.md', {})).not.toContain('"review"')
  })

  test('the key: where it is kept, from `live-review.sh key status`', () => {
    expect(keyPlaceOf('project\n')).toBe('project')
    expect(keyPlaceOf('global\n')).toBe('global')
    expect(keyPlaceOf('none\n')).toBe('none')
    expect(keyPlaceOf('')).toBe('none')
    expect(keyArgv('/plugin', 'set', '--project')).toEqual(['/bin/sh', '/plugin/bin/live-review.sh', 'key', 'set', '--project'])
  })
})

describe('live review: what Gemini reports', () => {
  test('its instructions: the teammate\'s checks, then flags unasked; observe is its only output, and costs no extra turn', () => {
    const text = instructionsOf('the total updates after Add')
    expect(text).toContain('The tester asked you to check: the total updates after Add')
    expect(text).toContain('Also report kind "flag" for anything else that is not OK, unasked')
    expect(text).toContain('Never speak.')
    expect(instructionsOf('  ')).toContain('check: nothing in particular')
    expect(OBSERVE_TOOL.behavior).toBe('NON_BLOCKING')
    expect(OBSERVE_TOOL.parameters.required).toEqual(['at', 'kind', 'severity', 'text'])
  })

  test('a call becomes an observation: its frame\'s time when it is a real one, else the newest frame sent', () => {
    expect(observationOf({ at: 12.04, kind: 'watch', severity: 'info', text: ' Total is $55.00. ' }, 20, 18, SIZE))
      .toEqual({ at: 12, kind: 'watch', severity: 'info', text: 'Total is $55.00.' })
    expect(observationOf({ at: 99, kind: 'flag', severity: 'error', text: 'x' }, 20, 18, SIZE)?.at).toBe(18)
    expect(observationOf({ at: 'soon', text: 'x' }, 20, 18, SIZE)?.at).toBe(18)
    expect(observationOf({ at: -1, text: 'x' }, 20, 18, SIZE)?.at).toBe(18)
    expect(observationOf({ kind: 'info', severity: 'loud', text: 'x' }, 20, 18, SIZE)).toMatchObject({ kind: 'flag', severity: 'warning' })
    expect(observationOf({ at: 3, text: '  ' }, 20, 18, SIZE)).toBeUndefined()
  })

  test('a box: Gemini\'s [ymin, xmin, ymax, xmax] of 1000 becomes [x, y, w, h] in the recording\'s pixels', () => {
    expect(boxOf([500, 250, 750, 500], SIZE)).toEqual([960, 1080, 960, 540])
    expect(boxOf([-10, 0, 2000, 1000], SIZE)).toEqual([0, 0, 3840, 2160])
    expect(boxOf([0, 0, 0, 0], SIZE)).toBeUndefined()
    expect(boxOf([1, 2, 3], SIZE)).toBeUndefined()
    expect(boxOf('nope', SIZE)).toBeUndefined()
    expect(observationOf({ at: 1, text: 'x', box: [0, 0, 100, 100] }, 2, 1, SIZE)?.box).toEqual([0, 0, 384, 216])
  })

  test('a report said again (in other words of case and punctuation) is a repeat; another kind is not', () => {
    const earlier = [flag(4, 'TypeError: Cannot read “card”.')]
    expect(isRepeat(earlier, flag(9, 'typeerror cannot read card'))).toBe(true)
    expect(isRepeat(earlier, { ...flag(9, 'TypeError: Cannot read “card”.'), kind: 'watch' })).toBe(false)
    expect(isRepeat(earlier, flag(9, 'Total shows $40.00'))).toBe(false)
  })

  test('a frame changed when a few thumbnail pixels changed clearly, not for noise or the menu bar', () => {
    const blank = new Uint8Array(THUMB.width * THUMB.height).fill(200)
    const with_ = (row: number, count: number, value: number) => {
      const next = blank.slice()
      for (let i = 0; i < count; i++) next[row * THUMB.width + i] = value
      return next
    }
    expect(isChanged(undefined, blank)).toBe(true)
    expect(isChanged(blank, blank.slice())).toBe(false)
    expect(isChanged(blank, with_(50, 3, 120))).toBe(true)
    expect(isChanged(blank, with_(50, 2, 120))).toBe(false)
    expect(isChanged(blank, with_(50, 40, 205))).toBe(false)
    expect(isChanged(blank, with_(0, 40, 0))).toBe(false)
  })

  test('times move onto the recording\'s clock (it starts a little late), kept inside it', () => {
    expect(shifted([flag(5, 'a'), flag(0.3, 'b'), flag(50, 'c')], 0.7, 45).map(one => one.at)).toEqual([4.3, 0, 45])
  })
})

describe('live review: the annotation format', () => {
  const observations = [flag(27.4, 'TypeError: Cannot read properties of undefined'), { ...flag(3.9, 'Total stays $40.00 after Add'), kind: 'watch' as const }]

  test('the list for the task file and the PR: by time, "m:ss", watch or FLAG and severity', () => {
    expect(listOf(observations)).toBe('- 0:03 watch, error: Total stays $40.00 after Add\n- 0:27 FLAG, error: TypeError: Cannot read properties of undefined')
    expect(listOf([])).toBe('- No observations.')
    expect(clockOf(65.9)).toBe('1:05')
  })

  test('subtitles: each report until the next, 4 seconds at least, cut at the end of the video', () => {
    expect(srtOf(observations, 30)).toBe([
      '1\n00:00:03,900 --> 00:00:27,400\nwatch, error: Total stays $40.00 after Add\n',
      '2\n00:00:27,400 --> 00:00:30,000\nFLAG, error: TypeError: Cannot read properties of undefined\n',
    ].join('\n'))
    expect(srtOf([flag(1, 'a'), flag(2, 'b')], 30)).toContain('00:00:01,000 --> 00:00:05,000')
  })

  test('review.md: what was watched, how many flagged, the cost, then the list', () => {
    const review: Review = { video: '/r/recording.mov', model: 'gemini-3.8-live', watch: 'the total', size: SIZE, seconds: 47, observations, usage: { prompt: { IMAGE: 1_000_000 }, response: { TEXT: 100_000 } } }
    expect(markdownOf(review)).toBe([
      '# Live review of /r/recording.mov',
      'Gemini (gemini-3.8-live) watched 0:47 of the test for: the total.',
      '2 observations, 1 flagged. Cost about $1.450.',
      '',
      listOf(observations),
      '',
    ].join('\n'))
  })

  test('the cost: tokens by modality at the Live price; thinking and output without modalities count as text', () => {
    const usage = addUsage({ prompt: {}, response: {} }, {
      promptTokensDetails: [{ modality: 'TEXT', tokenCount: 1000 }, { modality: 'IMAGE', tokenCount: 2000 }],
      responseTokenCount: 40,
      thoughtsTokenCount: 60,
    })
    expect(usage).toEqual({ prompt: { TEXT: 1000, IMAGE: 2000 }, response: { TEXT: 100 } })
    addUsage(usage, { responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 10 }] })
    expect(usage.response).toEqual({ TEXT: 100, AUDIO: 10 })
    expect(Math.round(costOf(usage) * 1e6)).toBe(3320) // 1000 × 0.75 + 2000 × 1 + 100 × 4.5 + 10 × 12 millionths of a dollar
  })
})
