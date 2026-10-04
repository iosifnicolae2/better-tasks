import { describe, expect, test } from 'claude-code/testing'

import { describeChoice, HARD_TYPE, leadModelRules, STUCK_RULE, TEAMMATE_TYPE, teammateModelRules, teammateTypes } from '../hooks/models'
import { parseOverrides, settingsOf } from '../hooks/settings'

describe('teammate model settings', () => {
  test('the defaults: Sonnet at xhigh for easy and normal tasks, Opus at high for hard ones, escalation on', () => {
    expect(settingsOf({}).models).toEqual({
      normal: { model: 'sonnet', effort: 'xhigh' },
      hard: { model: 'opus', effort: 'high' },
      escalate: true,
    })
  })

  test('each one can be set; a value that is not on the list falls back to the default', () => {
    const models = settingsOf({ teammateModel: 'opus', teammateEffort: 'low', hardModel: 'inherit', hardEffort: 'max', escalate: false }).models
    expect(models).toEqual({ normal: { model: 'opus', effort: 'low' }, hard: { model: 'inherit', effort: 'max' }, escalate: false })
    expect(settingsOf({ teammateModel: 'gpt', hardEffort: 'extreme' }).models.normal.model).toBe('sonnet')
    expect(settingsOf({ teammateModel: 'gpt', hardEffort: 'extreme' }).models.hard.effort).toBe('high')
  })

  test('config.json takes the same keys and refuses the same wrong values', () => {
    const { values, problems } = parseOverrides(JSON.stringify({ hardModel: 'fable', teammateEffort: 'extreme', escalate: 'yes' }))
    expect(values).toEqual({ hardModel: 'fable' })
    expect(problems).toEqual(['"teammateEffort" must be one of low, medium, high, xhigh, max', '"escalate" must be a boolean'])
  })
})

describe('teammate agent types', () => {
  const models = settingsOf({}).models

  test('one type for easy and normal tasks, one for hard ones, each with its model and effort', () => {
    const [normal, hard] = teammateTypes(models)
    expect([normal?.name, normal?.model, normal?.effort]).toEqual(['teammate', 'sonnet', 'xhigh'])
    expect([hard?.name, hard?.model, hard?.effort]).toEqual(['teammate-hard', 'opus', 'high'])
    expect(`better-tasks:${normal?.name}`).toBe(TEAMMATE_TYPE)
    expect(`better-tasks:${hard?.name}`).toBe(HARD_TYPE)
  })

  test('inherit says whose model it is', () => {
    expect(describeChoice({ model: 'inherit', effort: 'high' })).toBe("the manager's own model at high effort")
  })

  test('the lead rules name both types with their model and effort, and the escalation', () => {
    const rules = leadModelRules(models)
    expect(rules).toContain(`\`${TEAMMATE_TYPE}\` (sonnet at xhigh effort)`)
    expect(rules).toContain(`\`${HARD_TYPE}\` (opus at high effort)`)
    expect(rules).toContain(`its successor ("login-2") gets \`${HARD_TYPE}\``)
  })

  test('escalation off: the rules say a successor keeps its type', () => {
    const rules = leadModelRules({ ...models, escalate: false })
    expect(rules).toContain('Escalation is off')
    expect(rules).not.toContain('login-2')
  })

  test('only a teammate below the hard type, with escalation on, is asked to report being stuck', () => {
    expect(teammateModelRules(models, TEAMMATE_TYPE)).toBe(STUCK_RULE)
    expect(teammateModelRules(models, undefined)).toBe(STUCK_RULE)
    expect(teammateModelRules(models, HARD_TYPE)).toBe('')
    expect(teammateModelRules({ ...models, escalate: false }, TEAMMATE_TYPE)).toBe('')
  })
})
