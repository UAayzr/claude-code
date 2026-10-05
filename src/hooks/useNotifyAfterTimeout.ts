import { useEffect } from 'react'
import {
  getLastInteractionTime,
  updateLastInteractionTime,
} from '../bootstrap/state.js'
import { useTerminalNotification } from '@anthropic/ink'
import { sendNotification } from '../services/notifier.js'
// The time threshold in milliseconds for considering an interaction "recent" (3 seconds)
export const DEFAULT_INTERACTION_THRESHOLD_MS = 3000

function getTimeSinceLastInteraction(): number {
  return Date.now() - getLastInteractionTime()
}

function hasRecentInteraction(threshold: number): boolean {
  return getTimeSinceLastInteraction() < threshold
}

/**
 * Whether enough time has passed without user interaction to fire a
 * notification. Never fires in tests — the dev environment itself is win32
 * and a pending dialog would otherwise spawn a real powershell balloon.
 */
export function shouldNotifyAfterIdle(thresholdMs: number): boolean {
  return process.env.NODE_ENV !== 'test' && !hasRecentInteraction(thresholdMs)
}

// NOTE: User interaction tracking is now done in App.tsx's processKeysInBatch
// function, which calls updateLastInteractionTime() when any input is received.
// This avoids having a separate stdin 'data' listener that would compete with
// the main 'readable' listener and cause dropped input characters.

/**
 * Hook that manages desktop notifications after a timeout period.
 *
 * Shows a notification in two cases:
 * 1. Within one poll (~1s) if the app has already been idle longer than the threshold
 * 2. After the specified timeout if the user doesn't interact within that time
 *
 * @param message - The notification message to display
 * @param notificationType - The notification type for hooks/analytics
 * @param thresholdMs - Idle threshold in milliseconds (defaults to 3000ms)
 */
export function useNotifyAfterTimeout(
  message: string,
  notificationType: string,
  thresholdMs: number = DEFAULT_INTERACTION_THRESHOLD_MS,
): void {
  const terminal = useTerminalNotification()

  // Reset interaction time when hook is called to make sure that requests
  // that took a long time to complete don't pop up a notification right away.
  // Must be immediate because useEffect runs after Ink's render cycle has
  // already flushed; without it the timestamp stays stale and a premature
  // notification fires if the user is idle (no subsequent renders to flush).
  useEffect(() => {
    updateLastInteractionTime(true)
  }, [])

  useEffect(() => {
    let hasNotified = false
    // Poll at 1s granularity so the notification arrives within ~1s of the
    // idle threshold being crossed (the old 6s threshold polled at 6s).
    const timer = setInterval(() => {
      if (shouldNotifyAfterIdle(thresholdMs) && !hasNotified) {
        hasNotified = true
        clearInterval(timer)
        void sendNotification({ message, notificationType }, terminal)
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [message, notificationType, terminal, thresholdMs])
}
