import { describe, expect, mock, test } from 'bun:test'
import { logMock } from '../../../../tests/mocks/log'
import { debugMock } from '../../../../tests/mocks/debug'

// Cut the bootstrap/state dependency chain (same pattern as
// yoloClassifierAttempt.test.ts).
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

;(globalThis as unknown as { MACRO: { VERSION: string } }).MACRO = {
  VERSION: 'test',
}

const { resolveClassifierModel } = await import('../yoloClassifier.js')

const upper = (s: string) => s.toUpperCase()

describe('resolveClassifierModel', () => {
  test('env override wins over settings and remote', () => {
    const result = resolveClassifierModel({
      envModel: 'env-model',
      settingsModel: 'settings-model',
      remoteModel: 'remote-model',
      isPoorModeActive: false,
      resolveSettingsModel: upper,
      defaultSonnetModel: 'sonnet-default',
      mainLoopModel: 'main-loop',
    })
    expect(result).toBe('env-model')
  })

  test('settings beats remote and is alias-resolved', () => {
    const resolver = mock(upper)
    const result = resolveClassifierModel({
      envModel: undefined,
      settingsModel: 'my-settings-model',
      remoteModel: 'remote-model',
      isPoorModeActive: false,
      resolveSettingsModel: resolver,
      defaultSonnetModel: 'sonnet-default',
      mainLoopModel: 'main-loop',
    })
    expect(result).toBe('MY-SETTINGS-MODEL')
    expect(resolver).toHaveBeenCalledWith('my-settings-model')
  })

  test("hand-written 'default' settings model is skipped (resolver not called, falls to remote)", () => {
    const resolver = mock(upper)
    for (const settingsModel of ['default', 'DEFAULT', ' default ']) {
      resolver.mockClear()
      const result = resolveClassifierModel({
        envModel: undefined,
        settingsModel,
        remoteModel: 'remote-model',
        isPoorModeActive: false,
        resolveSettingsModel: resolver,
        defaultSonnetModel: 'sonnet-default',
        mainLoopModel: 'main-loop',
      })
      expect(result).toBe('remote-model')
      expect(resolver).not.toHaveBeenCalled()
    }
  })

  test('remote beats poor-mode downgrade', () => {
    const result = resolveClassifierModel({
      envModel: undefined,
      settingsModel: undefined,
      remoteModel: 'remote-model',
      isPoorModeActive: true,
      resolveSettingsModel: upper,
      defaultSonnetModel: 'sonnet-default',
      mainLoopModel: 'main-loop',
    })
    expect(result).toBe('remote-model')
  })

  test('poor mode downgrades to Sonnet', () => {
    const result = resolveClassifierModel({
      envModel: undefined,
      settingsModel: undefined,
      remoteModel: undefined,
      isPoorModeActive: true,
      resolveSettingsModel: upper,
      defaultSonnetModel: 'sonnet-default',
      mainLoopModel: 'main-loop',
    })
    expect(result).toBe('sonnet-default')
  })

  test('falls back to the main loop model', () => {
    const result = resolveClassifierModel({
      envModel: undefined,
      settingsModel: undefined,
      remoteModel: undefined,
      isPoorModeActive: false,
      resolveSettingsModel: upper,
      defaultSonnetModel: 'sonnet-default',
      mainLoopModel: 'main-loop',
    })
    expect(result).toBe('main-loop')
  })
  // Note: no case exercises the real parseUserSpecifiedModel — mock.module is
  // process-global (last-write-wins), so its alias resolution can be polluted
  // by other test files. The "settings value is passed through the resolver"
  // contract is already covered by the mocked-resolver case above; alias →
  // family-default mapping is model.ts's own responsibility.
})
