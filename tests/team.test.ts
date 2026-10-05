import { expect, test } from 'claude-code/testing'

import { settingsOf } from '../hooks/settings'
import { effortOf, mateLine, stateOf, teamOf } from '../hooks/team'
import type { Teammate } from '../types'

const MODELS = settingsOf({ hardEffort: 'xhigh' }).models
const agent = (type: string) => ({ id: 'a1', name: 'login', description: 'login', type, status: 'running' as const })
const mate = (fields: Partial<Teammate>): Teammate => ({ id: 'a1', name: 'login', status: 'running', ...fields })

test("a teammate's effort comes from its better-tasks type and the settings", () => {
  expect(effortOf('better-tasks:teammate-easy', MODELS)).toBe('low')
  expect(effortOf('better-tasks:teammate-normal', MODELS)).toBe('medium')
  expect(effortOf('better-tasks:teammate-hard', MODELS)).toBe('xhigh')
  expect(effortOf('teammate', MODELS)).toBeUndefined()
  expect(teamOf([agent('better-tasks:teammate-normal')], {}, 1000, {}, undefined, MODELS)[0]?.effort).toBe('medium')
})

test('its state is one plain word', () => {
  expect(stateOf(mate({}))).toBe('idle')
  expect(stateOf(mate({ status: 'idle' }))).toBe('idle')
  expect(stateOf(mate({ activity: 'editing auth.ts' }))).toBe('working')
  expect(stateOf(mate({ activity: 'waiting for your answer' }))).toBe('waiting')
  expect(stateOf(mate({ status: 'completed' }))).toBe('done')
  expect(stateOf(mate({ status: 'killed' }))).toBe('stopped')
})

test('its line reads name · effort · state', () => {
  expect(mateLine(mate({ effort: 'medium', activity: 'editing auth.ts', percent: 41 }))).toBe('login · medium · working · context 41 % · editing auth.ts')
  expect(mateLine(mate({}))).toBe('login · idle · context ?')
})
