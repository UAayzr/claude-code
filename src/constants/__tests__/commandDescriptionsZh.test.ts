import { describe, expect, test } from 'bun:test'
import {
  COMMAND_DESCRIPTIONS_ZH,
  DYNAMIC_DESCRIPTION_COMMANDS,
  getCommandDescriptionZh,
  getSourceSuffixZh,
} from '../commandDescriptionsZh.js'
import type { Command } from '../../types/command.js'

// ─── 真实内置命令全集(与 src/commands.ts COMMANDS() 及门控 require 对应)────

const BUILTIN_COMMAND_NAMES = [
  'add-dir',
  'advisor',
  'agents-platform',
  'triggers',
  'memory-stores',
  'skill-store',
  'vault',
  'local-vault',
  'local-memory',
  'autonomy',
  'provider',
  'artifacts',
  'agents',
  'branch',
  'btw',
  'chrome',
  'clear',
  'color',
  'compact',
  'config',
  'copy',
  'desktop',
  'context',
  'diff',
  'doctor',
  'effort',
  'exit',
  'fast',
  'files',
  'heapdump',
  'help',
  'ide',
  'init',
  'keybindings',
  'lang',
  'install-github-app',
  'install-slack-app',
  'mcp',
  'memory',
  'mobile',
  'mode',
  'model',
  'output-style',
  'remote-env',
  'plugin',
  'pr-comments',
  'release-notes',
  'reload-plugins',
  'rename',
  'resume',
  'session',
  'skills',
  'status',
  'statusline',
  'stickers',
  'tag',
  'theme',
  'feedback',
  'review',
  'ultrareview',
  'rewind',
  'security-review',
  'terminal-setup',
  'upgrade',
  'extra-usage',
  'rate-limit-options',
  'usage',
  'insights',
  'vim',
  'web-tools',
  'think-back',
  'thinkback-play',
  'permissions',
  'plan',
  'privacy-settings',
  'hooks',
  'export',
  'sandbox',
  'logout',
  'login',
  'passes',
  'tasks',
  'summary',
  'recap',
  'skill-learning',
  'skill-search',
  'autofix-pr',
  'commit',
  'commit-push-pr',
  'bridge-kick',
  'version',
  'init-verifiers',
  'env',
  'debug-tool-call',
  'perf-issue',
  'break-cache',
  'issue',
  'share',
  'teleport',
  'tui',
  'onboarding',
]

// feature 门控命令(测试环境 feature() 返回 false,不在 COMMANDS() 内)
const GATED_COMMAND_NAMES = [
  'web-setup',
  'fork',
  'buddy',
  'poor',
  'goal',
  'proactive',
  'monitor',
  'coordinator',
  'brief',
  'assistant',
  'remote-control',
  'remote-control-server',
  'voice',
  'ultraplan',
  'torch',
  'daemon',
  'job',
  'force-snip',
  'subscribe-pr',
]

// UDS_INBOX 系列(构建默认禁用)
const UDS_COMMAND_NAMES = [
  'peers',
  'attach',
  'detach',
  'send',
  'pipes',
  'pipe-status',
  'history',
  'claim-main',
]

// 捆绑技能注册名(与 src/skills/bundledSkills.ts 一致)
const BUNDLED_SKILL_NAMES = [
  'claude-api',
  'claude-in-chrome',
  'batch',
  'cron-list',
  'cron-delete',
  'debug',
  'dream',
  'keybindings-help',
  'loop',
  'lorem-ipsum',
  'remember',
  'schedule',
  'simplify',
  'skillify',
  'stuck',
  'find-flaky-tests',
  'review-changes',
  'ultracode',
  'update-config',
  'use-artifacts',
  'verify',
]

function makeCommand(name: string, opts?: Partial<Command>): Command {
  return {
    name,
    description: `${name} command`,
    type: 'local',
    handler: () => {},
    ...opts,
  } as unknown as Command
}

describe('COMMAND_DESCRIPTIONS_ZH', () => {
  test('表内每个 key 都是真实存在的命令名', () => {
    const known = new Set([
      ...BUILTIN_COMMAND_NAMES,
      ...GATED_COMMAND_NAMES,
      ...UDS_COMMAND_NAMES,
      ...BUNDLED_SKILL_NAMES,
    ])
    const unknownKeys = Object.keys(COMMAND_DESCRIPTIONS_ZH).filter(
      key => !known.has(key),
    )
    expect(unknownKeys).toEqual([])
  })

  test('表内每个 key 都不重复', () => {
    const keys = Object.keys(COMMAND_DESCRIPTIONS_ZH)
    expect(new Set(keys).size).toBe(keys.length)
  })

  test('value 非空且不含英文来源后缀残留', () => {
    for (const [key, value] of Object.entries(COMMAND_DESCRIPTIONS_ZH)) {
      expect(value.trim().length, `${key} 为空`).toBeGreaterThan(0)
      expect(value, `${key} 含英文后缀`).not.toMatch(
        /\((workflow|bundled|plugin|user|project|managed)\)/,
      )
    }
  })

  test('9 个动态 getter 命令不在表内(防误加覆盖 in-place 文案)', () => {
    for (const name of DYNAMIC_DESCRIPTION_COMMANDS) {
      expect(
        COMMAND_DESCRIPTIONS_ZH[name],
        `${name} 不应出现在翻译表中`,
      ).toBeUndefined()
    }
  })
})

describe('getCommandDescriptionZh', () => {
  test('内置命令命中中文翻译', () => {
    const cmd = makeCommand('clear', { type: 'prompt', source: 'builtin' })
    expect(getCommandDescriptionZh(cmd)).toBe('清空对话历史,释放上下文')
  })

  test('插件/MCP 命令直接返回 undefined(保持原文)', () => {
    const pluginCmd = makeCommand('clear', { type: 'prompt', source: 'plugin' })
    const mcpCmd = makeCommand('clear', { type: 'prompt', source: 'mcp' })
    expect(getCommandDescriptionZh(pluginCmd)).toBeUndefined()
    expect(getCommandDescriptionZh(mcpCmd)).toBeUndefined()
  })

  test('不在表中的命令返回 undefined', () => {
    const cmd = makeCommand('custom-command', {
      type: 'prompt',
      source: 'builtin',
    })
    expect(getCommandDescriptionZh(cmd)).toBeUndefined()
  })
})

describe('getSourceSuffixZh', () => {
  test('各来源后缀中文化', () => {
    const base = { type: 'prompt', description: 'x' } as Partial<Command>

    expect(getSourceSuffixZh({ ...base, kind: 'workflow' } as Command)).toBe(
      ' (工作流)',
    )
    expect(getSourceSuffixZh({ ...base, source: 'bundled' } as Command)).toBe(
      ' (内置)',
    )
    expect(getSourceSuffixZh({ ...base, source: 'plugin' } as Command)).toBe(
      ' (插件)',
    )
    expect(getSourceSuffixZh({ ...base, source: 'builtin' } as Command)).toBe(
      '',
    )
    expect(getSourceSuffixZh({ ...base, source: 'mcp' } as Command)).toBe('')
    expect(
      getSourceSuffixZh({ ...base, source: 'userSettings' } as Command),
    ).toBe(' (用户)')
    expect(
      getSourceSuffixZh({ ...base, source: 'projectSettings' } as Command),
    ).toBe(' (项目)')
    expect(
      getSourceSuffixZh({ ...base, source: 'flagSettings' } as Command),
    ).toBe(' (CLI 参数)')
    expect(
      getSourceSuffixZh({ ...base, source: 'policySettings' } as Command),
    ).toBe(' (托管)')
  })
})
