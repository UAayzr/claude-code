import { describe, expect, mock, test } from 'bun:test'

mock.module('bun:bundle', () => ({
  feature: () => false,
}))
mock.module('src/services/analytics/index.js', () => ({
  logEvent: () => {},
  stripProtoFields: (v: unknown) => v,
}))

import { EnterPlanModeTool } from '@claude-code-best/builtin-tools/tools/EnterPlanModeTool/EnterPlanModeTool.js'
import { ExitPlanModeV2Tool } from '@claude-code-best/builtin-tools/tools/ExitPlanModeTool/ExitPlanModeV2Tool.js'
import {
  getElicitationNotificationMessage,
  getPendingApprovalInfo,
  getPromptNotificationMessage,
  getSandboxPermissionNotificationMessage,
  getToolPermissionNotificationMessage,
} from '../utils.js'
import type { ToolUseConfirm } from '../PermissionRequest.js'

function makeToolUseConfirm(
  toolName: string | null,
  tool: object,
  isRealTool: boolean,
  toolUseID = 'tool-use-1',
): ToolUseConfirm {
  return {
    // Real tool objects are kept by reference so identity comparisons
    // (plan-mode special cases) work; stubs get a userFacingName.
    tool: isRealTool ? tool : { userFacingName: () => toolName },
    input: {},
    toolUseID,
    onReject: () => {},
  } as unknown as ToolUseConfirm
}

describe('getToolPermissionNotificationMessage', () => {
  test('special-cases plan mode tools', () => {
    expect(
      getToolPermissionNotificationMessage(
        makeToolUseConfirm('ExitPlanMode', ExitPlanModeV2Tool, true),
      ),
    ).toBe('UAayzr Code 需要你批准此计划')
    expect(
      getToolPermissionNotificationMessage(
        makeToolUseConfirm('EnterPlanMode', EnterPlanModeTool, true),
      ),
    ).toBe('UAayzr Code 想要进入计划模式')
  })

  test('falls back to attention when tool name is empty', () => {
    expect(
      getToolPermissionNotificationMessage(makeToolUseConfirm('', {}, false)),
    ).toBe('UAayzr Code 需要你的关注')
    expect(
      getToolPermissionNotificationMessage(makeToolUseConfirm('  ', {}, false)),
    ).toBe('UAayzr Code 需要你的关注')
  })

  test('names the tool for ordinary permission requests', () => {
    expect(
      getToolPermissionNotificationMessage(
        makeToolUseConfirm('Bash', {}, false),
      ),
    ).toBe('UAayzr Code 需要你的批准才能使用 Bash')
  })
})

describe('sandbox/prompt/elicitation messages', () => {
  test('sandbox includes port when set', () => {
    expect(
      getSandboxPermissionNotificationMessage({
        host: 'example.com',
        port: 443,
      }),
    ).toBe('UAayzr Code 需要你的批准才能访问 example.com:443')
    expect(
      getSandboxPermissionNotificationMessage({
        host: 'example.com',
        port: undefined,
      }),
    ).toBe('UAayzr Code 需要你的批准才能访问 example.com')
  })

  test('prompt uses request.message (display text, not the id)', () => {
    expect(
      getPromptNotificationMessage({
        request: { prompt: 'req-1', message: 'Pick a model', options: [] },
      }),
    ).toBe('UAayzr Code 需要你的输入：Pick a model')
  })

  test('elicitation surfaces params.message', () => {
    expect(
      getElicitationNotificationMessage({
        serverName: 'git',
        requestId: '42',
        params: { message: 'Approve this rebase?', type: 'form', schema: {} },
      } as never),
    ).toBe('UAayzr Code 需要你的输入：Approve this rebase?')
  })
})

describe('getPendingApprovalInfo', () => {
  test('returns null when nothing is pending', () => {
    expect(getPendingApprovalInfo({})).toBeNull()
    expect(
      getPendingApprovalInfo({
        sandbox: null,
        tool: null,
        prompt: null,
        elicitation: null,
      }),
    ).toBeNull()
  })

  test('sandbox wins priority, mirroring getFocusedInputDialog', () => {
    const info = getPendingApprovalInfo({
      sandbox: { hostPattern: { host: 'example.com', port: 443 } },
      tool: makeToolUseConfirm('Bash', {}, false),
    })
    expect(info).not.toBeNull()
    expect(info!.key).toBe('sandbox:example.com:443')
    expect(info!.message).toBe(
      'UAayzr Code 需要你的批准才能访问 example.com:443',
    )
    expect(info!.notificationType).toBe('permission_prompt')
  })

  test('sandbox key omits port as "any"', () => {
    const noPort = getPendingApprovalInfo({
      sandbox: { hostPattern: { host: 'example.com', port: undefined } },
    })
    expect(noPort!.key).toBe('sandbox:example.com:any')
  })

  test('formats each scene key, message and type', () => {
    const tool = getPendingApprovalInfo({
      tool: makeToolUseConfirm('Bash', {}, false, 'abc'),
    })
    expect(tool).toEqual({
      key: 'tool:abc',
      message: 'UAayzr Code 需要你的批准才能使用 Bash',
      notificationType: 'permission_prompt',
    })

    const prompt = getPendingApprovalInfo({
      prompt: { request: { prompt: 'req-1', message: 'Pick', options: [] } },
    })
    expect(prompt!.key).toBe('prompt:req-1')
    expect(prompt!.notificationType).toBe('permission_prompt')

    const form = getPendingApprovalInfo({
      elicitation: {
        serverName: 'git',
        requestId: '42',
        params: { message: 'x', mode: 'form', schema: {} },
      } as never,
    })
    expect(form!.key).toBe('elicitation:git:42')
    expect(form!.notificationType).toBe('elicitation_dialog')

    const url = getPendingApprovalInfo({
      elicitation: {
        serverName: 'git',
        requestId: '43',
        params: { message: 'y', mode: 'url', url: 'https://x' },
      } as never,
    })
    expect(url!.key).toBe('elicitation:git:43')
    expect(url!.notificationType).toBe('elicitation_url_dialog')
  })
})
