import { existsSync } from 'fs'
import * as path from 'path'
import type { TerminalNotification } from '@anthropic/ink'
import { getGlobalConfig } from '../utils/config.js'
import { distRoot } from '../utils/distRoot.js'
import { env } from '../utils/env.js'
import { execFileNoThrow } from '../utils/execFileNoThrow.js'
import { logForDebugging } from '../utils/debug.js'
import { executeNotificationHooks } from '../utils/hooks.js'
import { logError } from '../utils/log.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from './analytics/index.js'

export type NotificationOptions = {
  message: string
  title?: string
  notificationType: string
}

export async function sendNotification(
  notif: NotificationOptions,
  terminal: TerminalNotification,
): Promise<void> {
  try {
    const config = getGlobalConfig()
    const channel = config.preferredNotifChannel

    // Hook failures must not block the desktop notification itself; a hook
    // that merely throws is logged and the channel still sends. (A hook that
    // hangs is not intercepted here — its own timeout governs that.)
    try {
      await executeNotificationHooks(notif)
    } catch (error) {
      logForDebugging(
        `[windows-notif] notification hooks threw: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    const methodUsed = await sendToChannel(channel, notif, terminal)

    logEvent('tengu_notification_method_used', {
      configured_channel:
        channel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      method_used:
        methodUsed as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      term: env.terminal as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
  } catch (error) {
    // sendNotification is invoked fire-and-forget (void …); never surface an
    // unhandled rejection to the caller.
    logForDebugging(
      `[windows-notif] send THREW: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

const DEFAULT_TITLE = 'UAayzr Code'

async function sendToChannel(
  channel: string,
  opts: NotificationOptions,
  terminal: TerminalNotification,
): Promise<string> {
  const title = opts.title || DEFAULT_TITLE

  try {
    switch (channel) {
      case 'auto':
        return sendAuto(opts, terminal)
      case 'iterm2':
        terminal.notifyITerm2(opts)
        return 'iterm2'
      case 'iterm2_with_bell':
        terminal.notifyITerm2(opts)
        terminal.notifyBell()
        return 'iterm2_with_bell'
      case 'kitty':
        terminal.notifyKitty({ ...opts, title, id: generateKittyId() })
        return 'kitty'
      case 'ghostty':
        terminal.notifyGhostty({ ...opts, title })
        return 'ghostty'
      case 'terminal_bell':
        terminal.notifyBell()
        return 'terminal_bell'
      case 'notifications_disabled':
        return 'disabled'
      default:
        return 'none'
    }
  } catch {
    return 'error'
  }
}

// BalloonTipText caps around 255 chars; BalloonTipTitle caps at 63.
const BALLOON_TEXT_MAX = 250
const BALLOON_TITLE_MAX = 63
// Add-Type first-run compilation on slow machines + the 8s sleep must fit.
const WINDOWS_BALLOON_TIMEOUT_MS = 20_000

/** Fold whitespace, truncate for balloon limits, escape single quotes for PS strings */
export function sanitizeBalloonText(text: string, maxLength: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  const truncated =
    collapsed.length > maxLength
      ? `${collapsed.slice(0, maxLength - 1)}…`
      : collapsed
  return truncated.replace(/'/g, "''")
}

/**
 * Escape a literal string for a PS single-quoted string. Unlike
 * sanitizeBalloonText this does NOT fold/truncate — used for file paths
 * where whitespace and length must survive verbatim.
 */
function escapePsSingleQuoted(s: string): string {
  return s.replace(/'/g, "''")
}

// notificationType → bundled mp3 sound. question.mp3 covers everything that
// needs user attention; task-complete.mp3 marks run-to-completion events.
// error / plan-ready / review-complete are kept in the bundle for later use.
const SOUND_FILES: Record<string, string> = {
  permission_prompt: 'question.mp3',
  worker_permission_prompt: 'question.mp3',
  elicitation_dialog: 'question.mp3',
  elicitation_url_dialog: 'question.mp3',
  idle_prompt: 'question.mp3',
  computer_use_enter: 'question.mp3',
  computer_use_exit: 'task-complete.mp3',
  auth_success: 'task-complete.mp3',
  turn_complete: 'task-complete.mp3',
}

export function resolveSoundFileName(notificationType: string): string {
  return SOUND_FILES[notificationType] ?? 'question.mp3'
}

/**
 * Resolve a bundled sound file's absolute path across both layouts: the
 * built dist copies src/utils/vendor/sounds/ → dist/vendor/sounds/, while
 * dev mode runs from the source tree (same dual-layout trick as ripgrep).
 * Returns the first candidate that exists; silent degradation if neither
 * does — the balloon still shows without audio.
 */
export function resolveSoundFilePath(fileName: string): string {
  const candidates = [
    path.resolve(distRoot, 'vendor', 'sounds', fileName),
    path.resolve(distRoot, 'src', 'utils', 'vendor', 'sounds', fileName),
  ]
  return candidates.find(existsSync) ?? candidates[0]
}

/**
 * Builds a PowerShell script that shows a tray balloon + plays a bundled mp3
 * through MCI (winmm.dll — system decoder, no ffmpeg needed). Runs as a
 * backgrounded child process via -EncodedCommand (UTF-16LE base64), awaited
 * up to 20s — no shell quoting is needed and the script body stays inert
 * (PS single-quoted strings cannot escape to execute). MCI open/play
 * failures are silent — the balloon still shows.
 */
export function buildWindowsBalloonScript(
  title: string,
  message: string,
  soundPath: string,
): string {
  const t = sanitizeBalloonText(title, BALLOON_TITLE_MAX)
  const m = sanitizeBalloonText(message, BALLOON_TEXT_MAX)
  const p = escapePsSingleQuoted(soundPath)
  return [
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    `Add-Type -Namespace Win32 -Name MCI -MemberDefinition '[DllImport("winmm.dll", CharSet=CharSet.Unicode)] public static extern int mciSendString(string cmd, System.Text.StringBuilder ret, int retLen, System.IntPtr hwndCallback);'`,
    '$n = New-Object System.Windows.Forms.NotifyIcon',
    '$n.Icon = [System.Drawing.SystemIcons]::Information',
    '$n.Visible = $true',
    `$n.Text = '${t}'`,
    '$n.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info',
    `$n.BalloonTipTitle = '${t}'`,
    `$n.BalloonTipText = '${m}'`,
    '$n.ShowBalloonTip(5000)',
    // play … wait blocks until the audio finishes (question.mp3 ≈ 2s).
    `[Win32.MCI]::mciSendString('open "${p}" alias s', $null, 0, [IntPtr]::Zero)`,
    "[Win32.MCI]::mciSendString('play s wait', $null, 0, [IntPtr]::Zero)",
    "[Win32.MCI]::mciSendString('close s', $null, 0, [IntPtr]::Zero)",
    // Keep the NotifyIcon alive past the balloon lifetime — disposing
    // immediately would make the balloon vanish.
    'Start-Sleep -Seconds 8',
    '$n.Visible = $false',
    '$n.Dispose()',
  ].join('\n')
}

async function sendWindowsNotification(
  opts: NotificationOptions & { title: string },
): Promise<string> {
  const soundPath = resolveSoundFilePath(
    resolveSoundFileName(opts.notificationType),
  )
  const script = buildWindowsBalloonScript(opts.title, opts.message, soundPath)
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const result = await execFileNoThrow(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-EncodedCommand',
      encoded,
    ],
    { timeout: WINDOWS_BALLOON_TIMEOUT_MS },
  )
  logForDebugging(
    `[windows-notif] spawn done: code=${result.code} err=${result.error ?? 'none'}`,
  )
  return result.code === 0 ? 'windows_balloon' : 'no_method_available'
}

async function sendAuto(
  opts: NotificationOptions,
  terminal: TerminalNotification,
): Promise<string> {
  const title = opts.title || DEFAULT_TITLE

  // Windows Terminal/conhost ignore the terminal OSC notification channels
  // (iTerm2/kitty/ghostty), so the auto channel is a silent no-op there.
  // Use a native tray balloon + system sound instead.
  if (env.platform === 'win32') {
    return sendWindowsNotification({ ...opts, title })
  }

  switch (env.terminal) {
    case 'Apple_Terminal': {
      const bellDisabled = await isAppleTerminalBellDisabled()
      if (bellDisabled) {
        terminal.notifyBell()
        return 'terminal_bell'
      }
      return 'no_method_available'
    }
    case 'iTerm.app':
      terminal.notifyITerm2(opts)
      return 'iterm2'
    case 'kitty':
      terminal.notifyKitty({ ...opts, title, id: generateKittyId() })
      return 'kitty'
    case 'ghostty':
      terminal.notifyGhostty({ ...opts, title })
      return 'ghostty'
    default:
      return 'no_method_available'
  }
}

function generateKittyId(): number {
  return Math.floor(Math.random() * 10000)
}

async function isAppleTerminalBellDisabled(): Promise<boolean> {
  try {
    if (env.terminal !== 'Apple_Terminal') {
      return false
    }

    const osascriptResult = await execFileNoThrow('osascript', [
      '-e',
      'tell application "Terminal" to name of current settings of front window',
    ])
    const currentProfile = osascriptResult.stdout.trim()

    if (!currentProfile) {
      return false
    }

    const defaultsOutput = await execFileNoThrow('defaults', [
      'export',
      'com.apple.Terminal',
      '-',
    ])

    if (defaultsOutput.code !== 0) {
      return false
    }

    // Lazy-load plist (~280KB with xmlbuilder+@xmldom) — only hit on
    // Apple_Terminal with auto-channel, which is a small fraction of users.
    const plist = await import('plist')
    const parsed: Record<string, unknown> = plist.parse(
      defaultsOutput.stdout,
    ) as any
    const windowSettings = parsed?.['Window Settings'] as
      | Record<string, unknown>
      | undefined
    const profileSettings = windowSettings?.[currentProfile] as
      | Record<string, unknown>
      | undefined

    if (!profileSettings) {
      return false
    }

    return profileSettings.Bell === false
  } catch (error) {
    logError(error)
    return false
  }
}
