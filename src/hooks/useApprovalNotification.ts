import { useEffect, useRef } from 'react'
import type { TerminalNotification } from '@anthropic/ink'
import { updateLastInteractionTime } from '../bootstrap/state.js'
import {
  getPendingApprovalInfo,
  type PendingApprovalQueues,
} from '../components/permissions/utils.js'
import { sendNotification } from '../services/notifier.js'
import { logForDebugging } from '../utils/debug.js'
import {
  DEFAULT_INTERACTION_THRESHOLD_MS,
  shouldNotifyAfterIdle,
} from './useNotifyAfterTimeout.js'

type UseApprovalNotificationParams = {
  /** True when an approval dialog is focused or suppressed by typing */
  approvalPending: boolean
  /** Heads of the REPL-local approval queues (rebuilt each render) */
  queues: PendingApprovalQueues
  terminal: TerminalNotification
}

/**
 * Fires a sound + desktop notification when an approval dialog appears and
 * the user stays idle for DEFAULT_INTERACTION_THRESHOLD_MS (3s). Keyed by
 * the pending request so each new approval reminds exactly once; the dedupe
 * re-arms when the queue drains so a later request can remind again.
 *
 * Dialogs blocked by a non-animated toolJSX overlay or the message selector
 * don't remind — the user is engaged in another modal there (their caller
 * excludes them; suppressed-while-typing requests still remind, though).
 */
export function useApprovalNotification({
  approvalPending,
  queues,
  terminal,
}: UseApprovalNotificationParams): void {
  const pendingInfo = approvalPending ? getPendingApprovalInfo(queues) : null
  const pendingKey = pendingInfo?.key ?? null
  const notifiedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!pendingKey) {
      // Queue drained → re-arm so a new request can remind again.
      notifiedKeyRef.current = null
      return
    }
    if (notifiedKeyRef.current === pendingKey) return
    // Mark before scheduling so re-renders can't start a second timer.
    notifiedKeyRef.current = pendingKey
    // The interval callback closes over this effect scope, so the message and
    // type stay frozen at dialog-appearance time — no refs needed.
    const { message, notificationType } = pendingInfo!
    // Anchor the idle timer at dialog appearance; also suppresses the
    // response-idle "waiting for your input" notification so the two never
    // double-fire (that check compares lastInteraction vs query end). Side
    // effect: other lastInteractionTime consumers (usePrStatus,
    // backgroundHousekeeping) also see this as activity and delay by the
    // idle window — acceptable.
    updateLastInteractionTime(true)
    // Poll at 1s granularity so the notification arrives within ~1s of the
    // idle threshold being crossed.
    const timer = setInterval(() => {
      if (shouldNotifyAfterIdle(DEFAULT_INTERACTION_THRESHOLD_MS)) {
        clearInterval(timer)
        logForDebugging(`[approval-notify] firing: ${message}`)
        void sendNotification({ message, notificationType }, terminal)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [pendingKey, terminal])
}
