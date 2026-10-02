import { existsSync } from 'fs'
import { join } from 'path'
import type { ReadonlySettings } from '../hooks/useSettings.js'
import { distRoot } from './distRoot.js'

// UAayzr 内置默认状态行：vendored claude-hud（vendor/claude-hud/src）。
// 用户显式配置 settings.statusLine 优先；否则指向内置 HUD —— 构建态
// （dist/vendor/claude-hud/index.js 存在）用 node 跑编译产物，dev 态
// （bun run dev 无 dist/）用 bun 直接跑 TS 源码。
export function getEffectiveStatusLine(
  settings: ReadonlySettings | undefined,
): ReadonlySettings['statusLine'] {
  if (settings?.statusLine) return settings.statusLine
  const distEntry = join(distRoot, 'vendor', 'claude-hud', 'index.js')
  if (existsSync(distEntry)) {
    return { type: 'command', command: `node "${distEntry}"` }
  }
  return {
    type: 'command',
    command: `bun "${join(distRoot, 'vendor', 'claude-hud', 'src', 'index.ts')}"`,
  }
}
