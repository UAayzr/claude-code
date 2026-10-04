import { describe, expect, test } from 'bun:test'
import { mergeAutoModeConfigs } from '../settings.js'

describe('mergeAutoModeConfigs', () => {
  test('returns undefined when all values are empty', () => {
    expect(mergeAutoModeConfigs([undefined, null, {}])).toBeUndefined()
  })

  test('returns non-undefined for a model-only config', () => {
    // Core regression: a model-only autoMode must not be swallowed.
    expect(mergeAutoModeConfigs([{ model: 'claude-sonnet-4-6' }])).toEqual({
      model: 'claude-sonnet-4-6',
    })
  })

  test('concatenates allow/soft_deny/environment across sources', () => {
    const result = mergeAutoModeConfigs([
      { allow: ['Bash(npm install)'], environment: ['OS: Windows'] },
      { soft_deny: ['Bash(rm -rf *)'], allow: ['Bash(npm run build)'] },
    ])
    expect(result).toEqual({
      allow: ['Bash(npm install)', 'Bash(npm run build)'],
      soft_deny: ['Bash(rm -rf *)'],
      environment: ['OS: Windows'],
    })
  })

  test('model scalar is first-wins across sources', () => {
    // userSettings is always the first source; an explicit user choice
    // outranks later sources (policy/flag).
    expect(mergeAutoModeConfigs([{ model: 'a' }, { model: 'b' }])).toEqual({
      model: 'a',
    })
  })

  test('empty or whitespace model is ignored', () => {
    expect(mergeAutoModeConfigs([{ model: '' }])).toBeUndefined()
    expect(mergeAutoModeConfigs([{ model: ' ' }])).toBeUndefined()
  })

  test("hand-written 'default' is treated as unset and doesn't shadow later sources", () => {
    expect(
      mergeAutoModeConfigs([{ model: 'default' }, { model: 'opus' }]),
    ).toEqual({
      model: 'opus',
    })
    expect(
      mergeAutoModeConfigs([{ model: 'DEFAULT' }, { model: 'opus' }]),
    ).toEqual({
      model: 'opus',
    })
    expect(mergeAutoModeConfigs([{ model: ' default ' }])).toBeUndefined()
  })

  test('folds ant deny into soft_deny', () => {
    const originalUserType = process.env.USER_TYPE
    process.env.USER_TYPE = 'ant'
    try {
      expect(mergeAutoModeConfigs([{ deny: ['Bash(rm -rf *)'] }])).toEqual({
        soft_deny: ['Bash(rm -rf *)'],
      })
    } finally {
      process.env.USER_TYPE = originalUserType
    }
  })

  test('skips invalid values', () => {
    expect(mergeAutoModeConfigs(['not-an-object', 42])).toBeUndefined()
  })
})
