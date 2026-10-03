import { describe, expect, mock, test } from 'bun:test'
import { logMock } from '../../../../tests/mocks/log'
import { debugMock } from '../../../../tests/mocks/debug'

// 回归安全网：feature('TREE_SITTER_BASH')=false 时（构建期 flag 漏开），
// 本地判定器必须全部 unknown——宁可通过分类器/人工弹窗，绝不误放行。
// 独立文件的原因见 localSafetyClassifier.test.ts 顶部注释：mock.module
// 是进程级 last-write-wins，与 feature=true 的用例同文件会互相覆盖。
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({
  feature: (_name: string) => false,
}))

;(globalThis as unknown as { MACRO: { VERSION: string } }).MACRO = {
  VERSION: 'test',
}

const { decideBashCommand } = await import('../localSafetyClassifier.js')

describe('decideBashCommand — TREE_SITTER_BASH 关闭时全部 unknown', () => {
  test('只读命令不得本地放行', async () => {
    for (const cmd of ['ls -la', 'git status', 'cat file', 'grep -rn x .']) {
      expect((await decideBashCommand(cmd)).kind).toBe('unknown')
    }
  })

  test('危险命令也不得本地 deny（避免 flag 漏开造成行为漂移）', async () => {
    for (const cmd of ['rm -rf /', 'sudo apt install x', 'eval "$STR"']) {
      expect((await decideBashCommand(cmd)).kind).toBe('unknown')
    }
  })
})
