/**
 * measure-system-prompt.ts — 系统提示词与工具描述规模测量。
 *
 * 阶段1(工具描述接口化)的前置与验收工具:输出改前/改后字节对比。
 *
 * 用法:
 *   bun scripts/measure-system-prompt.ts
 *
 * 输出:
 *   1. 主系统段各小节字节(通过 fev dump-system-prompt 快速路径导出)
 *   2. 工具描述源文件字节(>1KB 的 prompt.ts / constants.js)
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(__dirname, '..')
const TOOLS_DIR = join(ROOT, 'packages', 'builtin-tools', 'src', 'tools')

interface Section {
  title: string
  bytes: number
}

export function measureSystemPrompt(): { sections: Section[]; total: number } {
  const result = spawnSync('bun', ['scripts/dev.ts', '--dump-system-prompt'], {
    cwd: ROOT,
    env: { ...process.env, FEATURE_DUMP_SYSTEM_PROMPT: '1' },
    encoding: 'utf-8',
    timeout: 120_000,
  })
  if (result.status !== 0) {
    throw new Error(
      `dump-system-prompt failed (exit ${result.status}):\n${(result.stderr ?? result.stdout ?? '').slice(-2000)}`,
    )
  }
  const lines = (result.stdout ?? '').split('\n')
  // 第一行是 bun 运行装饰($ bun run scripts/dev.ts --dump-system-prompt)
  const body = lines.slice(1).join('\n')

  const sections: Section[] = []
  // 捕获整行标题(#[1]=标记, #[2]=名称);match.index 为行首,切片用
  const headingRegex = /^(#{1,3}) (.+)$/gm
  const headings = [...body.matchAll(headingRegex)]
  const introText = body.slice(0, headings[0]?.index ?? body.length)
  if (introText.trim().length > 0) {
    sections.push({ title: '(intro / CYBER_RISK)', bytes: introText.length })
  }
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index
    const end = headings[i + 1]?.index ?? body.length
    sections.push({
      title: `${headings[i][1]} ${headings[i][2]}`.trimEnd(),
      bytes: end - start,
    })
  }
  return { sections, total: body.length }
}

function measureToolDescriptors(): { file: string; bytes: number }[] {
  const entries: { file: string; bytes: number }[] = []
  for (const dir of readdirSync(TOOLS_DIR)) {
    if (dir.startsWith('__') || dir.startsWith('.')) continue
    for (const name of [
      'prompt.ts',
      'prompt.js',
      'constants.ts',
      'constants.js',
    ]) {
      const file = join(TOOLS_DIR, dir, name)
      try {
        const size = statSync(file).size
        if (size > 1000) {
          entries.push({ file: relative(ROOT, file), bytes: size })
        }
      } catch {
        // 文件不存在,跳过
      }
    }
  }
  return entries.sort((a, b) => b.bytes - a.bytes)
}

export function main(): void {
  const { sections, total } = measureSystemPrompt()
  console.log('== 主系统段(不含工具描述) ==')
  for (const s of sections) {
    console.log(`${String(s.bytes).padStart(7)}  ${s.title}`)
  }
  console.log(`${String(total).padStart(7)}  TOTAL`)

  console.log('\n== 工具描述源文件(>1KB) ==')
  let sum = 0
  for (const e of measureToolDescriptors()) {
    console.log(`${String(e.bytes).padStart(7)}  ${e.file}`)
    sum += e.bytes
  }
  console.log(`${String(sum).padStart(7)}  TOTAL_DESCRIPTORS`)
}

if (import.meta.main) {
  main()
}
