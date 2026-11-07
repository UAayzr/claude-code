import { describe, expect, mock, test } from 'bun:test'
import { feature } from 'bun:bundle'
import { logMock } from '../../../../tests/mocks/log'
import { debugMock } from '../../../../tests/mocks/debug'

// 双态门闩测试 — on 态(独立文件的原因:与 off 态断言互斥,分文件可各自
// 用 bun test --feature 注入,互不干扰)。
//
// 启用方式(重要):feature() 是编译期宏——bun test 默认把所有 feature()
// 编译为 false,运行时 mock.module('bun:bundle') 不拦截(已实测 feature
// 调用零记录)。on 态必须用 Bun 官方注入:
//
//   bun test --feature TRANSCRIPT_CLASSIFIER --feature POWERSHELL_AUTO_MODE \
//     src/utils/permissions/__tests__/powershellAutoMode.on.test.ts
//
// 全量 bun test / precheck 跑本文件时,feature 全 false,BASE_PROMPT 为空,
// 测试体被跳过(见下方 if),因此不会产生假失败。
//
// 断言目标:flag 开 → POWERSHELL_DENY_GUIDANCE(PS 专属危险引导)必须进入
// buildYoloSystemPrompt 的 deny 段——与 usingExternal 无关(外部构建同样
// 获得),这是「PS 危险通缉令发给保安」的核心行为。
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

const { buildYoloSystemPrompt } = await import('../yoloClassifier.js')

// feature 开才断言;全量跑(off)时跳过,避免空 BASE_PROMPT 假失败。
// 注:feature() 只能直接用于 if/三元条件位置(Bun 编译器约束),故用三元展开。
const psFlagEnabled = feature('POWERSHELL_AUTO_MODE') ? true : false
const tcEnabled = feature('TRANSCRIPT_CLASSIFIER') ? true : false
;(psFlagEnabled && tcEnabled ? describe : describe.skip)(
  'buildYoloSystemPrompt — POWERSHELL_AUTO_MODE on (--feature 注入)',
  () => {
    test('deny 段包含 PowerShell Download-and-Execute 引导(iex (iwr ...))', async () => {
      const prompt = await buildYoloSystemPrompt({} as never)
      expect(prompt).toContain('PowerShell Download-and-Execute')
      expect(prompt).toContain('iex (iwr ...)')
      expect(prompt).toContain('Invoke-Expression (Invoke-WebRequest ...)')
    })

    test('deny 段包含 PowerShell 不可逆销毁引导(Remove-Item -Recurse -Force)', async () => {
      const prompt = await buildYoloSystemPrompt({} as never)
      expect(prompt).toContain('PowerShell Irreversible Destruction')
      expect(prompt).toContain('Remove-Item -Recurse -Force')
    })

    test('deny 段包含 PowerShell 持久化引导($PROFILE/Run 注册表键)', async () => {
      const prompt = await buildYoloSystemPrompt({} as never)
      expect(prompt).toContain('PowerShell Persistence')
      expect(prompt).toContain('$PROFILE')
      expect(prompt).toContain('Register-ScheduledTask')
    })

    test('deny 段包含 PowerShell 提权引导(Start-Process -Verb RunAs)', async () => {
      const prompt = await buildYoloSystemPrompt({} as never)
      expect(prompt).toContain('PowerShell Elevation')
      expect(prompt).toContain('Start-Process -Verb RunAs')
    })
  },
)
