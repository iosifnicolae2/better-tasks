import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_TYPE, describeChoice, teammateTypes, typeOf } from '../hooks/models'
import { parseOverrides, settingsOf } from '../hooks/settings'

describe('teammate model settings', () => {
  test('the defaults: Opus at low, medium and high effort for easy, normal and hard tasks; escalation on', () => {
    expect(settingsOf({}).models).toEqual({
      easy: { model: 'opus', effort: 'low' },
      normal: { model: 'opus', effort: 'medium' },
      hard: { model: 'opus', effort: 'high' },
      escalate: true,
    })
  })

  test('each one can be set; a value that is not on the list falls back to the default', () => {
    const models = settingsOf({ easyModel: 'sonnet', normalEffort: 'xhigh', hardModel: 'inherit', hardEffort: 'max', escalate: false }).models
    expect(models).toEqual({
      easy: { model: 'sonnet', effort: 'low' },
      normal: { model: 'opus', effort: 'xhigh' },
      hard: { model: 'inherit', effort: 'max' },
      escalate: false,
    })
    const bad = settingsOf({ easyModel: 'gpt', hardEffort: 'extreme' }).models
    expect([bad.easy.model, bad.hard.effort]).toEqual(['opus', 'high'])
  })

  test('config.json takes the same keys and refuses the same wrong values', () => {
    const { values, problems } = parseOverrides(JSON.stringify({ hardModel: 'fable', normalEffort: 'extreme', escalate: 'yes' }))
    expect(values).toEqual({ hardModel: 'fable' })
    expect(problems).toEqual(['"normalEffort" must be one of low, medium, high, xhigh, max', '"escalate" must be a boolean'])
  })
})

describe('teammate agent types', () => {
  const models = settingsOf({}).models

  test('one type per level, each with its model and effort', () => {
    const types = teammateTypes(models)
    expect(types.map(type => [type.name, type.model, type.effort])).toEqual([
      ['teammate-easy', 'opus', 'low'],
      ['teammate-normal', 'opus', 'medium'],
      ['teammate-hard', 'opus', 'high'],
    ])
    expect(types.map(type => `better-tasks:${type.name}`)).toEqual([typeOf('easy'), typeOf('normal'), typeOf('hard')])
    expect(DEFAULT_TYPE).toBe(typeOf('normal'))
  })

  test('inherit says whose model it is', () => {
    expect(describeChoice({ model: 'inherit', effort: 'high' })).toBe("the manager's own model at high effort")
  })

})
