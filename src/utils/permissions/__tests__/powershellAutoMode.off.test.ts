import { describe, expect, mock, test } from 'bun:test'
import { feature } from 'bun:bundle'
import { logMock } from '../../../../tests/mocks/log'
import { debugMock } from '../../../../tests/mocks/debug'

// 双态门闩测试 — off 态(独立文件的原因:与 on 态断言互斥,分文件可各自
// 用 bun test --feature 注入,互不干扰)。
//
// 启用方式(重要):feature() 是编译期宏——bun test 默认把所有 feature()
// 编译为 false。要测「基础模板加载但 PS 引导被排除」的真 off 态,需用
// Bun 官方注入 TRANSCRIPT_CLASSIFIER(不带 POWERSHELL_AUTO_MODE):
//
//   bun test --feature TRANSCRIPT_CLASSIFIER \
//     src/utils/permissions/__tests__/powershellAutoMode.off.test.ts
//
// 全量 bun test / precheck 跑本文件时(feature 全 false),BASE_PROMPT 为
// 空,防假失败见下方 if 守卫。
//
// 回归安全网:flag 关时 POWERSHELL_DENY_GUIDANCE 为空数组,deny 段**不得**
// 出现任何 PS 专属引导——防止有人把 includePowerShellGuidance 改成无条件
// true 时仓库检测不到「off 态被污染」。
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

const { buildYoloSystemPrompt } = await import('../yoloClassifier.js')

const psFlagEnabled = feature('POWERSHELL_AUTO_MODE') ? true : false
const tcEnabled = feature('TRANSCRIPT_CLASSIFIER') ? true : false
// 真 off 态 = PS flag 关 + 基础模板已加载(TC flag 开);
// PS 开 → skip(由 on 态文件覆盖);TC 关 → 全量跑,BASE_PROMPT 为空,
// 断言无意义(不产生假失败)。
;(psFlagEnabled || !tcEnabled ? describe.skip : describe)(
  'buildYoloSystemPrompt — POWERSHELL_AUTO_MODE off',
  () => {
    test('deny 段不含任何 PS 专属引导', async () => {
      const prompt = await buildYoloSystemPrompt({} as never)
      expect(prompt).not.toContain('PowerShell Download-and-Execute')
      expect(prompt).not.toContain('iex (iwr ...)')
      expect(prompt).not.toContain('PowerShell Irreversible Destruction')
      expect(prompt).not.toContain('PowerShell Persistence')
      expect(prompt).not.toContain('PowerShell Elevation')
    })

    test('通用模板仍完整(Bash 规则不受 PS flag 影响)', async () => {
      const prompt = await buildYoloSystemPrompt({} as never)
      expect(prompt).toContain('curl | bash')
      expect(prompt).toContain('rm -rf')
    })
  },
)
