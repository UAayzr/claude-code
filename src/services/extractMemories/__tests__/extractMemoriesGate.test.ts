/**
 * 测试 extractMemories 的会话级触发门槛（时长 + token + 单会话一次）。
 *
 * 用 isolated 后缀避免 mock.module 的跨文件污染：本文件 mock 了
 * bootstrap/state 的 token 计数与 process.uptime，这些是进程全局的。
 *
 * 门槛逻辑本身很短，但有三处容易出错：
 *   1. resume 场景不能用 getTotalDuration（会被还原成上次会话时长）
 *   2. /clear 后 token 计数归零，需自然解锁而不是永远锁死
 *   3. trailing run 绕过 executeExtractMemoriesImpl，必须单独拦
 */
import { mock, describe, test, expect, beforeEach, afterAll } from 'bun:test'

// ── 可控的 state 桩 ──
// Spread 真实模块：Bun 的 mock.module 是进程全局的，若只提供部分导出，
// 其他测试文件的 import 链会拿到 undefined（如 addSlowOperation）。
const realState = await import('src/bootstrap/state.js')
let _outputTokens = 0
let _uptimeSec = 0
let _isRemoteMode = false

mock.module('src/bootstrap/state.js', () => ({
  ...realState,
  getIsRemoteMode: () => _isRemoteMode,
  getTotalOutputTokens: () => _outputTokens,
  getSessionId: () => 'test-session',
}))

// ── 控制 runForkedAgent 是否产生写入 ──
const realForkedAgent = await import('src/utils/forkedAgent.js')
let _writtenPaths: string[] = []
let _forkCallCount = 0

mock.module('src/utils/forkedAgent.js', () => ({
  ...realForkedAgent,
  createCacheSafeParams: () => ({
    systemPrompt: {},
    userContext: {},
    systemContext: {},
    toolUseContext: {},
    forkContextMessages: [],
  }),
  runForkedAgent: async () => {
    _forkCallCount++
    return {
      messages: _writtenPaths.length
        ? _writtenPaths.map(p => ({
            type: 'assistant',
            message: {
              content: [
                {
                  type: 'tool_use',
                  name: 'Write',
                  input: { file_path: p },
                },
              ],
            },
          }))
        : [],
      totalUsage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    }
  },
}))

mock.module('bun:bundle', () => ({
  feature: (_name: string) => false,
}))

mock.module('src/services/analytics/index.js', () => ({
  logEvent: () => {},
}))

mock.module('src/services/analytics/growthbook.js', () => ({
  getFeatureValue_CACHED_MAY_BE_STALE: (_key: string, def: unknown) =>
    // tengu_passport_quail 必须为 true，否则会在更早的 gate 返回
    _key === 'tengu_passport_quail' ? true : def,
}))

// 记忆扫描 / 路径
const realMemdirPaths = await import('src/memdir/paths.js')
let _memoryDir = '/test/memory/'
mock.module('src/memdir/paths.js', () => ({
  ...realMemdirPaths,
  getAutoMemPath: () => _memoryDir,
  isAutoMemoryEnabled: () => true,
  isAutoMemPath: (p: string) => p.startsWith(_memoryDir),
}))

const realMemoryScan = await import('src/memdir/memoryScan.js')
mock.module('src/memdir/memoryScan.js', () => ({
  ...realMemoryScan,
  formatMemoryManifest: () => '',
  scanMemoryFiles: async () => [],
}))

const realMemdir = await import('src/memdir/memdir.js')
mock.module('src/memdir/memdir.js', () => ({
  ...realMemdir,
  ENTRYPOINT_NAME: 'MEMORY.md',
}))

const realAbort = await import('src/utils/abortController.js')
mock.module('src/utils/abortController.js', () => ({
  ...realAbort,
  createAbortController: () => new AbortController(),
}))

const realDebug = await import('src/utils/debug.js')
mock.module('src/utils/debug.js', () => ({
  ...realDebug,
  logForDebugging: () => {},
}))

// ── 被测模块（在 mock 之后导入）──
const { initExtractMemories, executeExtractMemories } = await import(
  '../extractMemories.js'
)

// process.uptime 是全局的，测试里需要可控。真实值在测试进程里是几十秒，
// 无法覆盖「20 分钟」这类场景，因此整体替换。
const realUptime = process.uptime.bind(process)
process.uptime = () => _uptimeSec
afterAll(() => {
  process.uptime = realUptime
})

/** 构造最小可用的 REPLHookContext */
function makeContext(): Parameters<typeof executeExtractMemories>[0] {
  return {
    messages: [
      {
        type: 'assistant',
        uuid: '00000000-0000-0000-0000-000000000001',
        message: {
          id: 'resp-1',
          content: [{ type: 'text', text: 'hello' }],
          usage: { output_tokens: 100 },
        },
      },
    ],
    systemPrompt: {} as never,
    userContext: {},
    systemContext: {},
    toolUseContext: {
      agentId: undefined,
      getAppState: () => ({ tasks: {} }),
    } as never,
    querySource: 'repl_main_thread',
  }
}

/** 跑一次提取，返回是否真的调用了 fork agent */
async function runOnce(): Promise<boolean> {
  const before = _forkCallCount
  await executeExtractMemories(makeContext(), () => {})
  return _forkCallCount > before
}

beforeEach(() => {
  _outputTokens = 0
  _uptimeSec = 0
  _isRemoteMode = false
  _writtenPaths = []
  _forkCallCount = 0
  // 每个测试用全新闭包，重置 outputTokensAtLastSave
  initExtractMemories()
})

describe('会话级触发门槛', () => {
  test('时长不足 20 分钟 → 不提取', async () => {
    _uptimeSec = 300 // 5 分钟
    _outputTokens = 50_000 // token 充足
    _writtenPaths = ['/test/memory/a.md']

    const extracted = await runOnce()

    expect(extracted).toBe(false)
  })

  test('token 不足 20000 → 不提取', async () => {
    _uptimeSec = 1500 // 25 分钟
    _outputTokens = 500 // token 不足
    _writtenPaths = ['/test/memory/a.md']

    const extracted = await runOnce()

    expect(extracted).toBe(false)
  })

  test('时长与 token 都达标 → 提取一次', async () => {
    _uptimeSec = 1500
    _outputTokens = 30_000
    _writtenPaths = ['/test/memory/a.md']

    const extracted = await runOnce()

    expect(extracted).toBe(true)
  })

  test('同会话再次触发 → 被「单会话一次」拦住', async () => {
    _uptimeSec = 1500
    _outputTokens = 30_000
    _writtenPaths = ['/test/memory/a.md']

    const first = await runOnce()
    expect(first).toBe(true)

    // 继续聊，token 增长
    _outputTokens = 40_000
    const second = await runOnce()

    expect(second).toBe(false)
  })

  test('/clear 后 token 归零 → 重新解锁，可再提取一次', async () => {
    _uptimeSec = 1500
    _outputTokens = 30_000
    _writtenPaths = ['/test/memory/a.md']
    expect(await runOnce()).toBe(true)

    // 模拟 /clear：modelUsage 归零，token 从头累积
    _outputTokens = 25_000
    _uptimeSec = 2500
    const afterClear = await runOnce()

    expect(afterClear).toBe(true)
  })

  test('resume 场景：uptime 从 0 开始 → 即使 token 是历史大值也不提取', async () => {
    // --resume 昨天跑 40 分钟的会话：token 被还原成 50 万，
    // 但 process.uptime() 只有几秒。
    _uptimeSec = 5
    _outputTokens = 500_000
    _writtenPaths = ['/test/memory/a.md']

    const extracted = await runOnce()

    expect(extracted).toBe(false)
  })

  test('边界：正好 20 分钟 + 正好 20000 → 提取', async () => {
    _uptimeSec = 1200
    _outputTokens = 20_000
    _writtenPaths = ['/test/memory/a.md']

    expect(await runOnce()).toBe(true)
  })

  test('边界：19:59 + 19999 → 不提取', async () => {
    _uptimeSec = 1199
    _outputTokens = 19_999
    _writtenPaths = ['/test/memory/a.md']

    expect(await runOnce()).toBe(false)
  })

  test('提取未产生写入 → 不算「已提取」，下次仍可触发', async () => {
    _uptimeSec = 1500
    _outputTokens = 30_000
    _writtenPaths = [] // fork 没写任何文件

    expect(await runOnce()).toBe(true) // 确实跑了 fork

    // 因为没有写入，outputTokensAtLastSave 不推进，下次仍可跑
    _outputTokens = 35_000
    expect(await runOnce()).toBe(true)
  })

  test('remote 模式 → 不提取', async () => {
    _isRemoteMode = true
    _uptimeSec = 1500
    _outputTokens = 30_000
    _writtenPaths = ['/test/memory/a.md']

    expect(await runOnce()).toBe(false)
  })

  test('子 agent（有 agentId）→ 不提取', async () => {
    _uptimeSec = 1500
    _outputTokens = 30_000
    _writtenPaths = ['/test/memory/a.md']

    const ctx = makeContext()
    ;(ctx.toolUseContext as { agentId?: string }).agentId = 'sub-agent-1'
    const before = _forkCallCount
    await executeExtractMemories(ctx, () => {})

    expect(_forkCallCount).toBe(before)
  })
})
