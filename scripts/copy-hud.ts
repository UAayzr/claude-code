import { existsSync } from 'node:fs'
import { cp, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

// claude-hud 的运行时文件集。0.15 起它是多文件运行时：hud.mjs 用
// import.meta.url 定位同目录的 src/main.ts 和 fence.mjs，所以必须原样
// 复制，不能打包成单文件（打包后路径失效，会静默产出空状态栏）。
//
// 不复制：install.mjs、scripts/statusline.mjs、dist/index.js、skills/、
// tests/、verify/、maintainer/、.claude-plugin/、文档与图片。
// 详见 vendor/claude-hud/README.uaayzr.md。
const RUNTIME_FILES = [
  'hud.mjs',
  'collector.mjs',
  'fence.mjs',
  'package.json',
  'LICENSE',
]
const RUNTIME_DIRS = ['src']

// 缺文件时 HUD 不会报错，只会输出空状态栏。这里显式断言，
// 让构建在缺文件时直接失败，而不是把问题带到运行时。
const REQUIRED = ['hud.mjs', 'collector.mjs', 'fence.mjs', 'src/main.ts']

export async function copyClaudeHud(outdir: string): Promise<void> {
  const src = 'vendor/claude-hud'
  const dest = join(outdir, 'vendor', 'claude-hud')

  await mkdir(dest, { recursive: true })
  for (const file of RUNTIME_FILES) {
    await cp(join(src, file), join(dest, file))
  }
  for (const dir of RUNTIME_DIRS) {
    await cp(join(src, dir), join(dest, dir), { recursive: true })
  }

  const missing = REQUIRED.filter(f => !existsSync(join(dest, f)))
  if (missing.length > 0) {
    throw new Error(
      `claude-hud copy incomplete: missing ${missing.join(', ')} under ${dest}`,
    )
  }
  console.log(`Copied ${src}/ → ${dest}/`)
}
