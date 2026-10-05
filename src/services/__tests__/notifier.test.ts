import { existsSync } from 'node:fs'
import { describe, expect, mock, test } from 'bun:test'
import { logMock } from '../../../tests/mocks/log'
import { debugMock } from '../../../tests/mocks/debug'

// notifier.ts pulls in heavy modules (hooks.js, config.js, analytics) that are
// not needed for the pure script builder; stub the side-effecting ones only.
// log/debug use the shared mocks per project convention.
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('src/services/analytics/index.js', () => ({
  logEvent: () => {},
  stripProtoFields: (v: unknown) => v,
}))
mock.module('src/utils/hooks.js', () => ({
  executeNotificationHooks: async () => {},
}))
// Superset shape: language.test.ts mocks the same module with
// { preferredLanguage } — mock.module is process-global (last-write-wins),
// so both shapes must coexist for whichever file loads after the other.
mock.module('src/utils/config.js', () => ({
  getGlobalConfig: () => ({
    preferredNotifChannel: 'auto',
    preferredLanguage: undefined,
    messageIdleNotifThresholdMs: 0,
  }),
}))

import {
  buildWindowsBalloonScript,
  resolveSoundFilePath,
  resolveSoundFileName,
  sanitizeBalloonText,
} from '../notifier.js'

describe('sanitizeBalloonText', () => {
  test('escapes single quotes for PS string literals', () => {
    expect(sanitizeBalloonText("user's request", 250)).toBe("user''s request")
  })

  test('collapses whitespace and trims', () => {
    expect(sanitizeBalloonText('  line1\n  line2\t  line3  ', 250)).toBe(
      'line1 line2 line3',
    )
  })

  test('truncates above the limit with an ellipsis', () => {
    expect(sanitizeBalloonText('x'.repeat(260), 10)).toBe('xxxxxxxxx…')
  })

  test('keeps CJK and emoji intact within the limit', () => {
    const text = '需要你的批准：🐱🎉 猫娘提醒测试'
    const out = sanitizeBalloonText(text, 250)
    expect(out).toBe(text)
    expect(Buffer.from(out, 'utf16le').length).toBeGreaterThan(0)
  })
})

const SOUND_PATH = 'C:\\UAayzr\\vendor\\sounds\\question.mp3'

describe('buildWindowsBalloonScript', () => {
  test('emits a NotifyIcon balloon with MCI mp3 playback and 8s lifetime', () => {
    const script = buildWindowsBalloonScript(
      'UAayzr Code',
      'needs approval',
      SOUND_PATH,
    )

    expect(script).toContain('Add-Type -AssemblyName System.Windows.Forms')
    expect(script).toContain(
      '$n.Icon = [System.Drawing.SystemIcons]::Information',
    )
    expect(script).toContain("$n.BalloonTipTitle = 'UAayzr Code'")
    expect(script).toContain("$n.BalloonTipText = 'needs approval'")
    expect(script).toContain('$n.ShowBalloonTip(5000)')
    expect(script).toContain(
      `[Win32.MCI]::mciSendString('open "${SOUND_PATH}" alias s'`,
    )
    expect(script).toContain("'play s wait'")
    expect(script).toContain("'close s'")
    expect(script).not.toContain('SystemSounds')
    expect(script).toContain('Start-Sleep -Seconds 8')
    expect(script).toContain('$n.Dispose()')
  })

  test('escapes single quotes in the sound path for PS literals', () => {
    const script = buildWindowsBalloonScript(
      'UAayzr Code',
      'msg',
      "C:\\My 'Sounds'\\question.mp3",
    )
    expect(script).toContain(
      `[Win32.MCI]::mciSendString('open "C:\\My ''Sounds''\\question.mp3" alias s'`,
    )
  })

  test('caps the title at 63 chars and the message at 250', () => {
    const script = buildWindowsBalloonScript(
      't'.repeat(100),
      'm'.repeat(300),
      SOUND_PATH,
    )
    expect(script).toContain(`$n.BalloonTipTitle = '${'t'.repeat(62)}…'`)
    expect(script).toContain(`$n.BalloonTipText = '${'m'.repeat(249)}…'`)
  })

  test('encodes Chinese message via UTF-16LE base64 without corruption', () => {
    const script = buildWindowsBalloonScript(
      'UAayzr Code',
      '需要你的批准',
      SOUND_PATH,
    )
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    const decoded = Buffer.from(encoded, 'base64').toString('utf16le')
    expect(decoded).toBe(script)
    expect(decoded).toContain('需要你的批准')
  })
})

describe('resolveSoundFileName', () => {
  test('maps attention/approval types to question.mp3', () => {
    for (const type of [
      'permission_prompt',
      'worker_permission_prompt',
      'elicitation_dialog',
      'elicitation_url_dialog',
      'idle_prompt',
      'computer_use_enter',
    ]) {
      expect(resolveSoundFileName(type)).toBe('question.mp3')
    }
  })

  test('maps completion types to review-complete.mp3', () => {
    expect(resolveSoundFileName('computer_use_exit')).toBe(
      'review-complete.mp3',
    )
    expect(resolveSoundFileName('auth_success')).toBe('review-complete.mp3')
    expect(resolveSoundFileName('turn_complete')).toBe('review-complete.mp3')
    expect(resolveSoundFileName('plan_ready')).toBe('plan-ready.mp3')
  })

  test('unknown types fall back to question.mp3', () => {
    expect(resolveSoundFileName('anything_else')).toBe('question.mp3')
  })
})

describe('resolveSoundFilePath', () => {
  test('returns an existing sound path in either layout', () => {
    const p = resolveSoundFilePath('question.mp3')
    // dev layout: <root>/src/utils/vendor/sounds/…; dist layout:
    // <root>/dist/vendor/sounds/… — both end identically.
    expect(p.endsWith('question.mp3')).toBe(true)
    expect(p).toContain('vendor')
    expect(p).toContain('sounds')
    expect(existsSync(p)).toBe(true)
  })

  test('falls back to the first candidate without throwing when missing', () => {
    const p = resolveSoundFilePath('does-not-exist.mp3')
    expect(p.endsWith('does-not-exist.mp3')).toBe(true)
    expect(p).toContain('vendor')
    expect(p).toContain('sounds')
  })
})
