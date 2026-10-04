import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_TYPE, describeChoice, leadModelRules, STUCK_RULE, teammateModelRules, teammateTypes, typeOf } from '../hooks/models'
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

  test('the lead rules name the three types with their model and effort, and the escalation', () => {
    const rules = leadModelRules(models)
    expect(rules).toContain(`\`${typeOf('easy')}\`, opus at low effort`)
    expect(rules).toContain(`\`${typeOf('normal')}\`, opus at medium effort`)
    expect(rules).toContain(`\`${typeOf('hard')}\`, opus at high effort`)
    expect(rules).toContain(`its successor ("login-2") moves one level up, easy to \`${typeOf('normal')}\`, normal to \`${typeOf('hard')}\``)
  })

  test('escalation off: the rules say a successor keeps its type', () => {
    const rules = leadModelRules({ ...models, escalate: false })
    expect(rules).toContain('Escalation is off')
    expect(rules).not.toContain('login-2')
  })

  test('only a teammate below the hard level, with escalation on, is asked to report being stuck', () => {
    expect(teammateModelRules(models, typeOf('easy'))).toBe(STUCK_RULE)
    expect(teammateModelRules(models, typeOf('normal'))).toBe(STUCK_RULE)
    expect(teammateModelRules(models, undefined)).toBe(STUCK_RULE)
    expect(teammateModelRules(models, typeOf('hard'))).toBe('')
    expect(teammateModelRules({ ...models, escalate: false }, typeOf('normal'))).toBe('')
  })
})
