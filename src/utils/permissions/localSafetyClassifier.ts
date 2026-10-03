// 本地安全判定器 —— auto 模式批准的第一道闸门（两级语义）。
//
// - ALLOW：只读命令（复用 readOnlyCommandValidation 权威表）——直接放行
// - DENY：命中恶意代码拦截库（远程下载执行 / eval 系任意代码 / 根家目录
//   递归销毁 / profile 后门写入）——直接拦截，无需 AI 审批。准入标准：
//   只有恶意代码能入库；一般危险命令（sudo、rm 深路径、内联解释器等）有
//   合法场景，交 AI 分类器按意图审批。
// - UNKNOWN：交给 AI 分类器审批（不可用时调用方 fail-open 弹窗）
//
// 解析/规则不确定性一律归 unknown——本地没有把握不越权裁决。权限规则的
// allow/deny 裁决由 hasPermissionsToUseTool 规则层先行跑过，这里只做
// 「命令安全属性」判定。

import { feature } from 'bun:bundle'
import { stat } from 'node:fs/promises'
import { PARSE_ABORTED, parseCommandRaw } from '../bash/parser.js'
import {
  checkSemantics,
  parseForSecurityFromAst,
  type Redirect,
  type SimpleCommand,
} from '../bash/ast.js'
import type { ToolPermissionContext } from '../../Tool.js'
import { BASH_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/BashTool/toolName.js'
import { commandHasAnyCd } from '@claude-code-best/builtin-tools/tools/BashTool/bashPermissions.js'
import { checkReadOnlyConstraints } from '@claude-code-best/builtin-tools/tools/BashTool/readOnlyValidation.js'

export type LocalVerdict =
  | { kind: 'allow'; reason: string } // 只读，直接放行（0 API）
  | { kind: 'deny'; reason: string } // 恶意代码，直接拦截（0 API）
  | { kind: 'unknown' } // 交 AI 分类器审批

const MAX_COMMAND_LENGTH = 10000 // 与 parser.ts 对齐

// ---------------------------------------------------------------------------
// 恶意代码拦截库（命中即拒，无需 AI 审批）
// 准入标准：只有恶意代码能入库。一般危险命令（sudo、rm 深路径、内联解释器、
// 网络监听等）有合法场景 → 交 AI 审批。新增条目先问：这是否是无合法用途的
// 攻击 payload？是 → 入库。
// ---------------------------------------------------------------------------

// shell profile 文件名集合（redirects.target 尾段命中即「持久化后门」）
const PROFILE_FILE_NAMES = [
  '.bashrc',
  '.bash_profile',
  '.profile',
  '.zshrc',
  '.zshenv',
  '.zprofile',
  '.bash_login',
  '.bash_logout',
]

/** 恶意销毁目标：根 /、家目录 ~（含 ~/x）、当前目录 .、上级目录 ..。
 *  深路径（/tmp/foo）与浅层（node_modules）不入库 —— 有合法清理场景。 */
function isMaliciousDeletionTarget(target: string): boolean {
  if (target === '/' || target === '~' || target === '.' || target === '..')
    return true
  return target.startsWith('~/')
}

/** 命令级恶意首词：把参数当代码执行的命令。真实形态（`eval "$STR"`、
 *  `trap 'x' EXIT`）在 parse 预检阶段即 too-complex，checkSemantics 覆盖
 *  不到——首词检测兜底（与 simple 路径的 EVAL_LIKE_BUILTINS 一致）。 */
const COMMAND_LEVEL_MALICIOUS = new Set(['eval', 'exec', 'source', '.', 'trap'])

function hasRecursiveForceFlags(args: string[]): boolean {
  return args.some(
    a => a === '--recursive' || a === '--force' || /^-[Rrf]+$/.test(a),
  )
}

function detectMaliciousBash(commands: SimpleCommand[]): LocalVerdict | null {
  // eval 系任意代码执行（eval/source/./exec/command/builtin 等 EVAL_LIKE_BUILTINS）
  const semantics = checkSemantics(commands)
  if (!semantics.ok) {
    return {
      kind: 'deny',
      reason: `MALICIOUS: arbitrary code execution (${semantics.reason.toUpperCase()})`,
    }
  }

  // 远程下载执行：curl|wget|lynx 先下载、后由 bash|sh|zsh|fish 消费
  // （parser 已把 pipeline/&& 拆成保持执行顺序的命令序列；顺序相关防误伤）
  const baseNames = commands.map(c => commandName(c.argv))
  const isDownload = (n: string) => n === 'curl' || n === 'wget' || n === 'lynx'
  const isShellConsumer = (n: string) =>
    n === 'bash' || n === 'sh' || n === 'zsh' || n === 'fish'
  for (let i = 0; i < baseNames.length; i++) {
    if (!isDownload(baseNames[i]!)) continue
    for (let j = i + 1; j < baseNames.length; j++) {
      if (isShellConsumer(baseNames[j]!)) {
        return {
          kind: 'deny',
          reason:
            'MALICIOUS: remote code execution — downloading and executing code from the internet (curl|wget|lynx into a shell)',
        }
      }
    }
  }

  for (const cmd of commands) {
    const name = commandName(cmd.argv)
    const rest = cmd.argv.slice(1)

    // 根/家/当前目录递归强制销毁
    if ((name === 'rm' || name === 'rmdir') && hasRecursiveForceFlags(rest)) {
      const targets = rest.filter(a => !a.startsWith('-'))
      if (targets.some(t => isMaliciousDeletionTarget(t))) {
        return {
          kind: 'deny',
          reason:
            'MALICIOUS: data destruction — recursive force deletion of root/home/current directory (rm -rf)',
        }
      }
    }

    // shell profile 写入（持久化后门，登录即执行）
    for (const r of cmd.redirects) {
      const t = r.target
      const base = t.split('/').pop() ?? t
      if (PROFILE_FILE_NAMES.includes(base) || PROFILE_FILE_NAMES.includes(t)) {
        return {
          kind: 'deny',
          reason: `MALICIOUS: persistence backdoor — modifying shell profile (${base})`,
        }
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// 只读判定（ALLOW）
// ---------------------------------------------------------------------------

/**
 * 上游只读表未收录的纯只读工具。每条 = [命令名, 参数谓词]，谓词通过才参与
 * 判定：无条件的（xxd/od/whereis/printenv/哈希族…）；top 仅批处理（-b，
 * 交互式挂终端不放行）；env 仅纯查询（带命令是执行包装器，交 AI）。
 */
const EXTRA_READONLY_RULES: ReadonlyArray<
  readonly [string, (args: string[]) => boolean]
> = [
  ['xxd', () => true],
  ['od', () => true],
  ['hexdump', () => true],
  ['strings', () => true],
  ['base64', () => true],
  ['cksum', () => true],
  ['sha256sum', () => true],
  ['sha1sum', () => true],
  ['md5sum', () => true],
  ['whereis', () => true],
  ['printenv', () => true],
  ['top', args => args.includes('-b')],
  ['env', args => args.every(a => a.startsWith('-'))],
  // export 纯设值/查询（KEY=value 或 -p 等 flag）：无文件系统副作用。
  // 带命令的 export 包装器（export VAR && cmd）会被 parser 拆成多条，
  // export 这条独立 allow，cmd 那条单独判定。值内容任意（env 赋值）。
  [
    'export',
    args =>
      args.every(
        a => a.startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=(.*)$/.test(a),
      ),
  ],
]

function extraReadonlyMatch(argv: string[]): boolean {
  const name = commandName(argv)
  return EXTRA_READONLY_RULES.some(
    ([n, pred]) => n === name && pred(argv.slice(1)),
  )
}

// ---------------------------------------------------------------------------
// 项目脚本执行通道（allow）
// 信任边界（用户确认）：python/python3/py 跑「项目内脚本」本地放行——路径
// 形态判定在同步核心（可测），文件存在性校验在 async 层（decideBashCommand
// 对 allow 结果做 stat，不存在 → 降级 unknown 交 AI，防 PATH 劫持/别名塞
// 假脚本）。只放行 python 系（用户确认不做 node/npx）。脚本内容本身不在
// 判定范围（python deploy.py 也会放行）——这是有意放宽，普通用户验证脚本
// 高频操作优先免弹窗。
// ---------------------------------------------------------------------------

/** 项目脚本放行 reason（async 层据此做存在性校验）。 */
const PROJECT_SCRIPT_REASON = 'Project-local script execution'

function isPythonCommand(name: string): boolean {
  return name === 'python' || name === 'python3' || name === 'py'
}

/** python 跑项目内脚本：argv[1] 是相对脚本路径（非 flag、非 ~、非绝对路径、不含 ..、无 glob）。 */
function isProjectScriptArgv(argv: string[]): boolean {
  if (argv.length < 2) return false
  const script = argv[1]!
  if (script.startsWith('-') || script.startsWith('~')) return false
  if (/^[A-Za-z]:[\\/]/.test(script) || script.startsWith('/')) return false
  if (script.split(/[\\/]/).includes('..')) return false
  // glob 展开会改变参数结构（python *.py → python a.py b.py，本就不合法）
  if (/[*?[\]]/.test(script)) return false
  return true
}

/** cd 目标校验：只允许纯相对子目录。拒绝 ~（家目录）、绝对路径、含 ..
 *  段（越出项目）、含 $（变量展开不可静态判定）——否则 `cd ~ && python
 *  s.py` 可绕过「项目内脚本」信任边界（叠加 stat 基于进程 cwd 的事实，
 *  外部/家目录脚本可能被 auto-allow）。 */
function isCdTargetSafe(argv: string[]): boolean {
  if (argv.length < 2) return false
  const target = argv[1]!
  if (target.startsWith('-') || target.startsWith('~')) return false
  if (/^[A-Za-z]:[\\/]/.test(target) || target.startsWith('/')) return false
  if (target.split(/[\\/]/).includes('..')) return false
  if (target.includes('$')) return false
  return true
}

/** 命令序列 = 无害前缀（cd 子目录/export/echo/env 查询）∪ python 项目脚本，且至少一条项目脚本。 */
function isProjectScriptExecution(commands: SimpleCommand[]): boolean {
  if (commands.some(c => c.redirects.some(isWriteRedirect))) return false
  let scriptSeen = false
  for (const c of commands) {
    const name = commandName(c.argv)
    if (name === 'cd') {
      if (!isCdTargetSafe(c.argv)) return false
      continue
    }
    if (name === 'export' || name === 'echo') continue
    if (name === 'env' && c.argv.every(a => a.startsWith('-'))) continue
    if (isPythonCommand(name)) {
      if (!isProjectScriptArgv(c.argv) || scriptSeen) return false
      scriptSeen = true
      continue
    }
    return false
  }
  return scriptSeen
}

/** 提取项目脚本路径（供 async 层 stat 存在性校验）。 */
function getProjectScriptPaths(commands: SimpleCommand[]): string[] {
  return commands
    .filter(c => isPythonCommand(commandName(c.argv)))
    .map(c => c.argv[1]!)
    .filter(p => typeof p === 'string' && p.length > 0)
}

function commandName(argv: string[]): string {
  const head = argv[0] ?? ''
  return head.split('/').pop() ?? head
}

/** 写方向重定向：> 系写文件；`2>&1` 等 fd 数字复制不写。 */
function isWriteRedirect(r: Redirect): boolean {
  if (
    r.op === '>' ||
    r.op === '>>' ||
    r.op === '>|' ||
    r.op === '&>' ||
    r.op === '&>>'
  )
    return true
  return r.op === '>&' && !/^\d+$/.test(r.target)
}

/** 词级 glob 判定（引号已由解析器消解）；`-` 前缀（flag 注入）与含 `$`（变量）不替换。 */
function isGlobWord(word: string): boolean {
  return /[*?[\]]/.test(word) && !word.startsWith('-') && !word.includes('$')
}

/**
 * 从 SimpleCommand[] 重建可判定的命令字符串（喂给 checkReadOnlyConstraints）：
 * - glob 词替换为占位符：检查器对未引用 glob 保守拒，但 glob 展开只产生
 *   文件名参数、命令结构不变（`file *.txt` 展开后仍是 `file <文件名>…`），
 *   占位后可精确判定；`-*`/`$x*` 保留原文 → 检查器保守拒（不放大放行面）
 * - 补充只读命令替换为 echo（保留参数——echo 参数无写语义）
 * - 重定向不参与重建（写方向已在入口经 AST 拦截；输入方向天然消解）
 */
function rebuildCommand(commands: SimpleCommand[]): string {
  let globIndex = 0
  return commands
    .map(c => {
      const argv = c.argv.map(w => (isGlobWord(w) ? `_glob${globIndex++}` : w))
      return extraReadonlyMatch(argv)
        ? ['echo', ...argv.slice(1)].join(' ')
        : argv.join(' ')
    })
    .join(' | ')
}

/**
 * 只读判定：写重定向（非沙箱自动放行禁止写盘）→ unknown；
 * 重建命令过权威检查器且行为 'allow' → 只读。
 */
function isReadOnlyCommand(commands: SimpleCommand[]): boolean {
  if (commands.some(c => c.redirects.some(isWriteRedirect))) return false
  const rebuilt = rebuildCommand(commands)
  if (rebuilt.trim().length === 0) return false
  return (
    checkReadOnlyConstraints(
      { command: rebuilt } as Parameters<typeof checkReadOnlyConstraints>[0],
      commandHasAnyCd(rebuilt),
    ).behavior === 'allow'
  )
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/** 入口：按工具名分发。非 Bash 工具一律 unknown（PowerShell 已在 permissions.ts
 *  前置门控、FileEdit 有 acceptEdits 快路径；context 预留按环境细化）。 */
export async function evaluateLocalSafety(
  toolName: string,
  toolInput: unknown,
  _context: ToolPermissionContext,
): Promise<LocalVerdict> {
  if (toolName !== BASH_TOOL_NAME) {
    return { kind: 'unknown' }
  }
  const input = toolInput as { command?: unknown } | null | undefined
  if (typeof input?.command !== 'string') {
    return { kind: 'unknown' }
  }
  return decideBashCommand(input.command)
}

/** Bash 命令三级判定：恶意库 deny / 只读 allow / unknown 交分类器。 */
export async function decideBashCommand(
  command: string,
): Promise<LocalVerdict> {
  if (!command || command.length > MAX_COMMAND_LENGTH) {
    return { kind: 'unknown' }
  }
  // 解析器被构建期 feature 门控关闭时无法静态分析 → 全部 unknown。
  // 回归安全网：flag 漏开时宁可通过分类器/人工弹窗，不误放行。
  if (!feature('TREE_SITTER_BASH') && !feature('TREE_SITTER_BASH_SHADOW')) {
    return { kind: 'unknown' }
  }

  const root = await parseCommandRaw(command)
  if (root === null || root === PARSE_ABORTED) {
    return { kind: 'unknown' }
  }
  const parsed = parseForSecurityFromAst(command, root)
  if (parsed.kind !== 'simple') {
    // too-complex（控制字符/变量展开/未知语法/对抗输入）或 parse-unavailable：
    // 没有完整解析的把握——但首词命中命令级恶意仍可直接拦截
    const firstWord = (command.split(/[\s|;&<>()$`]+/, 1)[0] ?? '')
      .split('/')
      .pop()
    if (firstWord && COMMAND_LEVEL_MALICIOUS.has(firstWord)) {
      return {
        kind: 'deny',
        reason: `MALICIOUS: arbitrary code execution (${firstWord})`,
      }
    }
    return { kind: 'unknown' }
  }
  const verdict = decideParsedCommand(command, parsed.commands)
  // 项目脚本放行：路径形态判定（同步核心）通过后，async 层校验脚本文件
  // 真实存在——防 PATH 劫持/命令别名把假脚本塞进项目目录。不存在 →
  // 降级 unknown（交 AI/弹窗）。注：stat 基于进程 cwd（cd 组合时的实际
  // 脚本目录可能有偏差，偏差方向是保守降级 unknown，可接受）。
  if (verdict.kind === 'allow' && verdict.reason === PROJECT_SCRIPT_REASON) {
    for (const script of getProjectScriptPaths(parsed.commands)) {
      try {
        await stat(script)
      } catch {
        return { kind: 'unknown' }
      }
    }
  }
  return verdict
}

/** 判定核心（纯同步，可测——bun test 下 feature 恒 false，见 disabled.test.ts）。
 *  `_command`：原命令字符串（重建判定走 AST，字符串仅保留 API 兼容）。 */
export function decideParsedCommand(
  _command: string,
  commands: SimpleCommand[] | null,
): LocalVerdict {
  if (commands === null) {
    return { kind: 'unknown' }
  }
  const malicious = detectMaliciousBash(commands)
  if (malicious) {
    return malicious
  }
  if (isReadOnlyCommand(commands)) {
    return { kind: 'allow', reason: 'Read-only command' }
  }
  if (isProjectScriptExecution(commands)) {
    return { kind: 'allow', reason: PROJECT_SCRIPT_REASON }
  }
  return { kind: 'unknown' }
}
