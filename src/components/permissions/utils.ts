import { feature } from 'bun:bundle'
import { EnterPlanModeTool } from '@claude-code-best/builtin-tools/tools/EnterPlanModeTool/EnterPlanModeTool.js'
import { ExitPlanModeV2Tool } from '@claude-code-best/builtin-tools/tools/ExitPlanModeTool/ExitPlanModeV2Tool.js'
import { getHostPlatformForAnalytics } from '../../utils/env.js'
import { type CompletionType, logUnaryEvent } from '../../utils/unaryLogging.js'
import type { NetworkHostPattern } from '../../utils/sandbox/sandbox-adapter.js'
import type { ElicitationRequestEvent } from '../../services/mcp/elicitationHandler.js'
import type { PromptRequest } from '../../types/hooks.js'
import type { ToolUseConfirm } from './PermissionRequest.js'

export function logUnaryPermissionEvent(
  completion_type: CompletionType,
  {
    assistantMessage: {
      message: { id: message_id },
    },
  }: ToolUseConfirm,
  event: 'accept' | 'reject',
  hasFeedback?: boolean,
): void {
  void logUnaryEvent({
    completion_type,
    event,
    metadata: {
      language_name: 'none',
      message_id: message_id!,
      platform: getHostPlatformForAnalytics(),
      hasFeedback: hasFeedback ?? false,
    },
  })
}

/* eslint-disable @typescript-eslint/no-require-imports */
const ReviewArtifactTool = feature('REVIEW_ARTIFACT')
  ? (
      require('@claude-code-best/builtin-tools/tools/ReviewArtifactTool/ReviewArtifactTool.js') as typeof import('@claude-code-best/builtin-tools/tools/ReviewArtifactTool/ReviewArtifactTool.js')
    ).ReviewArtifactTool
  : null

export function getToolPermissionNotificationMessage(
  toolUseConfirm: ToolUseConfirm,
): string {
  // Special-case before calling userFacingName so plan/review tools never
  // need their (input-dependent) display name computed for a notification.
  if (toolUseConfirm.tool === ExitPlanModeV2Tool) {
    return 'UAayzr Code 需要你批准此计划'
  }

  if (toolUseConfirm.tool === EnterPlanModeTool) {
    return 'UAayzr Code 想要进入计划模式'
  }

  if (
    feature('REVIEW_ARTIFACT') &&
    toolUseConfirm.tool === ReviewArtifactTool
  ) {
    return 'UAayzr Code 需要你批准审查制品'
  }

  const toolName = toolUseConfirm.tool.userFacingName(
    toolUseConfirm.input as never,
  )

  if (!toolName || toolName.trim() === '') {
    return 'UAayzr Code 需要你的关注'
  }

  return `UAayzr Code 需要你的批准才能使用 ${toolName}`
}

export function getSandboxPermissionNotificationMessage(
  hostPattern: NetworkHostPattern,
): string {
  return `UAayzr Code 需要你的批准才能访问 ${hostPattern.host}${hostPattern.port ? `:${hostPattern.port}` : ''}`
}

export function getPromptNotificationMessage(promptQueueItem: {
  request: PromptRequest
}): string {
  return `UAayzr Code 需要你的输入：${promptQueueItem.request.message}`
}

export function getElicitationNotificationMessage(
  event: ElicitationRequestEvent,
): string {
  return `UAayzr Code 需要你的输入：${event.params.message}`
}

/**
 * Queue heads for the REPL approval dialogs. Every queue lives in REPL local
 * state (not AppState), so the unified approval hook reads them via this
 * shape. workerSandbox requests are intentionally absent: the inbox poller
 * already reminds immediately when they arrive.
 */
export type PendingApprovalQueues = {
  sandbox?: { hostPattern: NetworkHostPattern } | null
  tool?: ToolUseConfirm | null
  prompt?: { request: PromptRequest } | null
  elicitation?: ElicitationRequestEvent | null
}

export type PendingApprovalInfo = {
  key: string
  message: string
  notificationType: string
}

/**
 * Derives the pending approval's dedupe key, notification message and
 * notification type in one place. Priority order mirrors
 * getFocusedInputDialog's approval subset (sandbox-permission is evaluated
 * first there too). Returns null when nothing is pending.
 */
export function getPendingApprovalInfo(
  queues: PendingApprovalQueues,
): PendingApprovalInfo | null {
  if (queues.sandbox) {
    const { hostPattern } = queues.sandbox
    return {
      // port distinguishes concurrent requests to the same host
      key: `sandbox:${hostPattern.host}:${hostPattern.port ?? 'any'}`,
      message: getSandboxPermissionNotificationMessage(hostPattern),
      notificationType: 'permission_prompt',
    }
  }
  if (queues.tool) {
    return {
      key: `tool:${queues.tool.toolUseID}`,
      message: getToolPermissionNotificationMessage(queues.tool),
      notificationType: 'permission_prompt',
    }
  }
  if (queues.prompt) {
    return {
      // request.prompt is the request id (discriminator), not the display text
      key: `prompt:${queues.prompt.request.prompt}`,
      message: getPromptNotificationMessage(queues.prompt),
      notificationType: 'permission_prompt',
    }
  }
  if (queues.elicitation) {
    const params = queues.elicitation.params
    return {
      key: `elicitation:${queues.elicitation.serverName}:${String(queues.elicitation.requestId)}`,
      message: getElicitationNotificationMessage(queues.elicitation),
      // Keep the URL dialog's distinct type so user-configured Notification
      // hooks keyed on notification_type keep matching.
      notificationType:
        params.mode === 'url' ? 'elicitation_url_dialog' : 'elicitation_dialog',
    }
  }
  return null
}
