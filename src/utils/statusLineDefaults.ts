import { existsSync } from 'fs'
import { join } from 'path'
import type { ReadonlySettings } from '../hooks/useSettings.js'
import { distRoot } from './distRoot.js'

// UAayzr 内置默认状态行：vendored claude-hud（vendor/claude-hud）。
//
// 0.15 起它是多文件运行时：hud.mjs 用 import.meta.url 定位同目录的
// src/main.ts 和 fence.mjs，所以不能打包成单文件。构建态和 dev 态指向
// 同一个 hud.mjs，区别只在用什么跑它——Bun 下 hud.mjs 会自动 relay 到
// node（找不到 node 时打印升级提示）。
//
// 用户显式配置 settings.statusLine 时优先，否则用内置 HUD。
export function getEffectiveStatusLine(
  settings: ReadonlySettings | undefined,
): ReadonlySettings['statusLine'] {
  if (settings?.statusLine) return settings.statusLine

  const hudRoot = join(distRoot, 'vendor', 'claude-hud')
  const entry = join(hudRoot, 'hud.mjs')

  if (existsSync(entry)) {
    // dist/cli.js 是构建产物的标志：存在说明是安装态，用 node 跑；
    // 不存在说明是 dev 态（distRoot 解析到项目根），用 bun 跑。
    const runner = existsSync(join(distRoot, 'cli.js')) ? 'node' : 'bun'
    return { type: 'command', command: `${runner} "${entry}"` }
  }

  // 兜底一：0.10.x 留下的单文件产物，重新构建后自然消失。
  const legacy = join(hudRoot, 'index.js')
  if (existsSync(legacy)) {
    return { type: 'command', command: `node "${legacy}"` }
  }

  // 兜底二：直接跑源码入口，只有 Bun 能跑 TypeScript。
  return {
    type: 'command',
    command: `bun "${join(hudRoot, 'src', 'index.ts')}"`,
  }
}
