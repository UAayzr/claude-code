import { describe, expect, test } from 'bun:test'
import {
  YOLO_CLASSIFIER_TOOL_NAME,
  buildClassifierRequest,
  parseClassifierResult,
  parseClassifierText,
  parseToolUseInput,
} from '../classifierParse.js'

describe('parseToolUseInput — classify_result 工具调用解析', () => {
  test('正常 input（shouldBlock=false + reason + thinking）→ 解析成功', () => {
    expect(
      parseToolUseInput({
        type: 'tool_use',
        name: YOLO_CLASSIFIER_TOOL_NAME,
        input: {
          thinking: 'brief reasoning',
          shouldBlock: false,
          reason: 'allowed',
        },
      }),
    ).toEqual({
      block: false,
      reason: 'allowed',
      thinking: 'brief reasoning',
    })
  })

  test('shouldBlock=true 且 reason 缺失 → 默认 Blocked by classifier', () => {
    expect(
      parseToolUseInput({
        type: 'tool_use',
        name: YOLO_CLASSIFIER_TOOL_NAME,
        input: { thinking: 'x', shouldBlock: true },
      }),
    ).toEqual({ block: true, reason: 'Blocked by classifier', thinking: 'x' })
  })

  test('input 为 null / 数组 / 字符串 → null（OpenAI 分支 JSON.parse(null) 边界）', () => {
    for (const bad of [null, [1, 2], 'str']) {
      expect(
        parseToolUseInput({
          type: 'tool_use',
          name: YOLO_CLASSIFIER_TOOL_NAME,
          input: bad,
        }),
      ).toBeNull()
    }
  })

  test('shouldBlock 缺失 / 非布尔 → null', () => {
    for (const bad of [
      undefined,
      {},
      { shouldBlock: 'yes' },
      { shouldBlock: 1 },
    ]) {
      expect(
        parseToolUseInput({
          type: 'tool_use',
          name: YOLO_CLASSIFIER_TOOL_NAME,
          input: bad,
        }),
      ).toBeNull()
    }
  })

  test('thinking 缺失 → 无 thinking 字段', () => {
    const parsed = parseToolUseInput({
      type: 'tool_use',
      name: YOLO_CLASSIFIER_TOOL_NAME,
      input: { shouldBlock: false, reason: 'ok' },
    })
    expect(parsed).toEqual({ block: false, reason: 'ok' })
    expect(parsed?.thinking).toBeUndefined()
  })

  test('reason 为空白 → 默认值', () => {
    expect(
      parseToolUseInput({
        type: 'tool_use',
        name: YOLO_CLASSIFIER_TOOL_NAME,
        input: { shouldBlock: true, reason: '   ' },
      }),
    ).toEqual({ block: true, reason: 'Blocked by classifier' })
  })
})

describe('parseClassifierText — XML 文本兜底', () => {
  test('<block>no</block> → 放行', () => {
    expect(parseClassifierText('<block>no</block>')).toEqual({
      block: false,
      reason: 'Allowed by classifier',
    })
  })

  test('前导文本 + <block>yes</block><reason>…</reason> → 解析成功（兜底关键形态）', () => {
    expect(
      parseClassifierText(
        'some preamble <block>yes</block><reason>dangerous</reason>',
      ),
    ).toEqual({ block: true, reason: 'dangerous' })
  })

  test('thinking 块内容被提取、其内 block 标签不干扰 block 判定', () => {
    expect(
      parseClassifierText(
        '<thinking><block>yes</block></thinking><block>no</block>',
      ),
    ).toEqual({
      block: false,
      reason: 'Allowed by classifier',
      thinking: '<block>yes</block>',
    })
  })

  test('无 block → null', () => {
    expect(parseClassifierText('自然语言废话')).toBeNull()
  })
})

describe('parseClassifierResult — 工具优先 + XML 兜底（判别联合）', () => {
  test('有效工具调用 → ok=true, viaToolUse=true', () => {
    const r = parseClassifierResult([
      {
        type: 'tool_use',
        id: 't1',
        name: YOLO_CLASSIFIER_TOOL_NAME,
        input: { shouldBlock: false, reason: 'ok' },
      },
    ] as never)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.viaToolUse).toBe(true)
      expect(r.parsed.block).toBe(false)
    }
  })

  test('第一个 block 畸形、第二个有效 → 取第一个通过校验的', () => {
    const r = parseClassifierResult([
      {
        type: 'tool_use',
        id: 't1',
        name: YOLO_CLASSIFIER_TOOL_NAME,
        input: { shouldBlock: 'yes' },
      },
      {
        type: 'tool_use',
        id: 't2',
        name: YOLO_CLASSIFIER_TOOL_NAME,
        input: { shouldBlock: true, reason: 'block' },
      },
    ] as never)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.viaToolUse).toBe(true)
      expect(r.parsed).toEqual({ block: true, reason: 'block' })
    }
  })

  test('无工具调用但有 XML 文本 → ok=true, viaToolUse=false 兜底', () => {
    const r = parseClassifierResult([
      { type: 'text', text: '<block>no</block>' },
    ] as never)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.viaToolUse).toBe(false)
      expect(r.parsed.block).toBe(false)
    }
  })

  test('全失败且无工具调用 → ok=false, failureKind=xml_unparseable', () => {
    const r = parseClassifierResult([{ type: 'text', text: '废话' }] as never)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.failureKind).toBe('xml_unparseable')
    }
  })

  test('有工具调用但全部畸形 → ok=false, failureKind=malformed_tool_use', () => {
    const r = parseClassifierResult([
      {
        type: 'tool_use',
        id: 't1',
        name: YOLO_CLASSIFIER_TOOL_NAME,
        input: { shouldBlock: 'yes' },
      },
      {
        type: 'tool_use',
        id: 't2',
        name: YOLO_CLASSIFIER_TOOL_NAME,
        input: 'not-an-object',
      },
    ] as never)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.failureKind).toBe('malformed_tool_use')
    }
  })
})

describe('buildClassifierRequest — 请求形态锁定（防回归）', () => {
  const signal = new AbortController().signal
  const req = buildClassifierRequest({
    model: 'deepseek-v4-flash',
    system: [{ type: 'text', text: 'sys' }],
    userPrompt: 'user',
    signal,
    maxRetries: 2,
  })

  test('工具强制：tools 存在 + tool_choice 指向 classify_result', () => {
    expect(req.tools).toHaveLength(1)
    expect((req.tools as Array<{ name: string }>)[0]?.name).toBe(
      YOLO_CLASSIFIER_TOOL_NAME,
    )
    expect(req.tool_choice).toEqual({
      type: 'tool',
      name: YOLO_CLASSIFIER_TOOL_NAME,
    })
  })

  test('max_tokens 4096 + temperature 0 + 无 thinking 字段', () => {
    expect(req.max_tokens).toBe(4096)
    expect(req.temperature).toBe(0)
    expect('thinking' in req).toBe(false)
  })

  test('messages 只含 user prompt', () => {
    expect(req.messages).toEqual([{ role: 'user', content: 'user' }])
  })
})
