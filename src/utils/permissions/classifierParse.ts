/**
 * 分类器解析纯函数模块：工具调用优先 + XML 文本兜底的响应解析，以及请求形态构建。
 *
 * 独立成模块的原因：import 图轻（仅类型 import），bun test 可直测，避免
 * yoloClassifier.ts 的重副作用链（bootstrap/state、analytics、growthbook、
 * langfuse、settings、providers）污染测试环境。
 */
import type {
  BetaContentBlock,
  BetaTextBlockParam,
  BetaToolUnion,
} from '@anthropic-ai/sdk/resources/beta/messages.js'
import type { LangfuseSpan } from '../../services/langfuse/index.js'
import type { SideQueryOptions } from '../sideQuery.js'

export const YOLO_CLASSIFIER_TOOL_NAME = 'classify_result'

/** classify_result 工具契约：结构化输出 {thinking, shouldBlock, reason}，
 *  模型被工具 schema 约束——输出只能是合法工具调用，没有废话空间。 */
export const YOLO_CLASSIFIER_TOOL_SCHEMA: BetaToolUnion = {
  type: 'custom',
  name: YOLO_CLASSIFIER_TOOL_NAME,
  description: 'Report the security classification result for the agent action',
  input_schema: {
    type: 'object',
    properties: {
      thinking: {
        type: 'string',
        description: 'Brief step-by-step reasoning.',
      },
      shouldBlock: {
        type: 'boolean',
        description:
          'Whether the action should be blocked (true) or allowed (false)',
      },
      reason: {
        type: 'string',
        description: 'Brief explanation of the classification decision',
      },
    },
    required: ['thinking', 'shouldBlock', 'reason'],
  },
}

export type ClassifierParsed = {
  block: boolean
  reason: string
  thinking?: string
}

/**
 * 解析 classify_result 工具调用 input。null = 校验失败（调用方继续尝试下一
 * 个 block / XML 兜底）。
 *
 * 边界：OpenAI 分支 `JSON.parse('null')` 会产生 null input、流式路径可能
 * 产出数组——必须先 null-guard + Array.isArray 排除，再访问 shouldBlock。
 */
export function parseToolUseInput(block: {
  type: 'tool_use'
  name: string
  input: unknown
}): ClassifierParsed | null {
  const input = block.input
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const rec = input as Record<string, unknown>
  if (typeof rec.shouldBlock !== 'boolean') return null
  const reason =
    typeof rec.reason === 'string' && rec.reason.trim() ? rec.reason.trim() : ''
  const thinking =
    typeof rec.thinking === 'string' && rec.thinking.trim()
      ? rec.thinking.trim()
      : undefined
  return {
    block: rec.shouldBlock,
    reason:
      reason ||
      (rec.shouldBlock ? 'Blocked by classifier' : 'Allowed by classifier'),
    ...(thinking && { thinking }),
  }
}

// ---------------------------------------------------------------------------
// XML 文本兜底（逃生通道：代理不支持 tools 时模型可能输出文本格式）。
// 实测对 deepseek×中转站成功率≈0——保留但不承诺，主路径是工具强制。
// ---------------------------------------------------------------------------

/**
 * Strip thinking content so that <block>/<reason> tags inside the model's
 * chain-of-thought don't get matched by parsers.
 */
export function stripThinking(text: string): string {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
    .replace(/<thinking>[\s\S]*$/, '')
}

/**
 * Parse XML block response: <block>yes/no</block>
 * Strips thinking content first to avoid matching tags inside reasoning.
 * Returns true for "yes" (should block), false for "no", null if unparseable.
 */
export function parseXmlBlock(text: string): boolean | null {
  const matches = [
    ...stripThinking(text).matchAll(/<block>(yes|no)\b(<\/block>)?/gi),
  ]
  if (matches.length === 0) return null
  return matches[0]![1]!.toLowerCase() === 'yes'
}

/** Parse XML reason: <reason>...</reason> */
export function parseXmlReason(text: string): string | null {
  const matches = [
    ...stripThinking(text).matchAll(/<reason>([\s\S]*?)<\/reason>/g),
  ]
  if (matches.length === 0) return null
  return matches[0]![1]!.trim()
}

/** Parse XML thinking content: <thinking>...</thinking> */
export function parseXmlThinking(text: string): string | null {
  const match = /<thinking>([\s\S]*?)<\/thinking>/.exec(text)
  return match ? match[1]!.trim() : null
}

/** 解析分类器 XML 文本响应（<block>yes|no</block><reason>…</reason>）。
 *  null = 解析失败；block=no 时按系统提示不带 reason。 */
export function parseClassifierText(text: string): ClassifierParsed | null {
  const block = parseXmlBlock(text)
  if (block === null) return null
  const thinking = parseXmlThinking(text) ?? undefined
  return {
    block,
    reason: block
      ? (parseXmlReason(text) ?? 'Blocked by classifier')
      : 'Allowed by classifier',
    ...(thinking !== undefined && { thinking }),
  }
}

/**
 * 从响应 content 解析分类结果：工具调用优先（遍历全部 tool_use block，
 * 取第一个通过校验的），无有效工具调用 → XML 文本兜底。
 * 判别联合：ok=false 时 failureKind 区分失败原因——
 * `malformed_tool_use`：存在 classify_result 调用但全部畸形（工具路径工作
 *   但模型输出脏）；
 * `xml_unparseable`：无该调用（代理可能剥离 tools）且 XML 兜底也失败。
 */
export function parseClassifierResult(
  content: BetaContentBlock[],
):
  | { ok: true; parsed: ClassifierParsed; viaToolUse: boolean }
  | { ok: false; failureKind: 'malformed_tool_use' | 'xml_unparseable' } {
  const toolUseBlocks = content.filter(
    (b): b is Extract<BetaContentBlock, { type: 'tool_use' }> =>
      b.type === 'tool_use' && b.name === YOLO_CLASSIFIER_TOOL_NAME,
  )
  for (const block of toolUseBlocks) {
    const parsed = parseToolUseInput(block)
    if (parsed) return { ok: true, parsed, viaToolUse: true }
  }
  // 文本提取有意本地实现（filter text + join('')）：与 messages.ts 的
  // extractTextContent 行为等价，但保持本模块零运行时依赖（bun test 隔离）。
  const text = content
    .filter(
      (b): b is Extract<BetaContentBlock, { type: 'text' }> =>
        b.type === 'text',
    )
    .map(b => b.text)
    .join('')
  const xmlParsed = parseClassifierText(text)
  if (xmlParsed) return { ok: true, parsed: xmlParsed, viaToolUse: false }
  return {
    ok: false,
    failureKind:
      toolUseBlocks.length > 0 ? 'malformed_tool_use' : 'xml_unparseable',
  }
}

/**
 * 分类器请求形态（单测锁定防回归）：工具强制 + max_tokens 4096 +
 * temperature 0 + 不传 thinking（非标准参数，官方 OpenAI API 会 400，
 * 重构前工具路径本就不发；实测带/不带均成功）。
 * system 由调用方组装（首方路径带 cache_control）。
 */
export function buildClassifierRequest(opts: {
  model: string
  system: BetaTextBlockParam[]
  userPrompt: string
  signal: AbortSignal
  parentSpan?: LangfuseSpan | null
  maxRetries: number
}): SideQueryOptions {
  return {
    model: opts.model,
    max_tokens: 4096,
    system: opts.system,
    skipSystemPromptPrefix: true,
    temperature: 0,
    messages: [{ role: 'user', content: opts.userPrompt }],
    tools: [YOLO_CLASSIFIER_TOOL_SCHEMA],
    tool_choice: {
      type: 'tool',
      name: YOLO_CLASSIFIER_TOOL_NAME,
    },
    maxRetries: opts.maxRetries,
    signal: opts.signal,
    querySource: 'auto_mode',
    parentSpan: opts.parentSpan,
  }
}
