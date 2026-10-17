import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

mock.module('bun:bundle', () => ({
  feature: (_name: string) => false,
}))

let settingsJson: { cyberRisk?: unknown } = {}
mock.module('src/utils/settings/settings.js', () => ({
  getInitialSettings: () => settingsJson,
}))

const { isCyberRiskEnabled } = await import(
  'src/constants/cyberRiskInstruction.js'
)

const ENV_KEY = 'CLAUDE_CODE_CYBER_RISK'

beforeEach(() => {
  settingsJson = {}
  delete process.env[ENV_KEY]
})

afterEach(() => {
  settingsJson = {}
  delete process.env[ENV_KEY]
})

describe('isCyberRiskEnabled — default prompt switch', () => {
  test('default true (常态注入, dsh-purge 语义)', () => {
    expect(isCyberRiskEnabled()).toBe(true)
  })

  test('settings cyberRisk.enabled=false closes it', () => {
    settingsJson = { cyberRisk: { enabled: false } }
    expect(isCyberRiskEnabled()).toBe(false)
  })

  test('env truthy overrides settings off', () => {
    settingsJson = { cyberRisk: { enabled: false } }
    process.env[ENV_KEY] = '1'
    expect(isCyberRiskEnabled()).toBe(true)
  })

  test('env defined-falsy overrides settings on', () => {
    process.env[ENV_KEY] = '0'
    expect(isCyberRiskEnabled()).toBe(false)
    process.env[ENV_KEY] = 'false'
    expect(isCyberRiskEnabled()).toBe(false)
  })

  test('env unset leaves settings in charge', () => {
    settingsJson = { cyberRisk: { enabled: false } }
    expect(isCyberRiskEnabled()).toBe(false)
  })
})
