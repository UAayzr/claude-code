import type { LocalCommandCall } from 'src/types/command.js'
import { isCyberRiskEnabled } from 'src/constants/cyberRiskInstruction.js'
import { updateSettingsForSource } from 'src/utils/settings/settings.js'
import { getAPIProvider } from 'src/utils/model/providers.js'
import { getCwd } from 'src/utils/cwd.js'

/**
 * /drill 命令 — UAayzr Code 的提示词开关控制台。
 *
 * 当前职责:控制 CYBER_RISK_INSTRUCTION(小码酱原生默认提示词)的
 * 常态注入开关。开关实时生效——getSimpleIntroSection 每次组装系统
 * 提示词时重新调用 isCyberRiskEnabled(),无需清任何缓存;
 * updateSettingsForSource 内部自带 resetSettingsCache()。
 */
export const call: LocalCommandCall = async args => {
  const arg = args.trim().toLowerCase()
  const [sub, rest] = (() => {
    const i = arg.indexOf(' ')
    return i === -1 ? [arg, ''] : [arg.slice(0, i), arg.slice(i + 1).trim()]
  })()

  if (!arg || sub === 'status') {
    return {
      type: 'text',
      value: [
        `默认提示词(cyberRisk): ${isCyberRiskEnabled() ? '开启' : '关闭'}`,
        `  开关: /drill cyberrisk on|off`,
        `  设置: cyberRisk.enabled(默认 true)| 环境变量: CLAUDE_CODE_CYBER_RISK=1|0`,
        `  工作目录: ${getCwd()}`,
        `  模型提供方: ${getAPIProvider()}`,
      ].join('\n'),
    }
  }

  if (sub === 'cyberrisk' || sub === 'default') {
    const arg2 = rest.toLowerCase()
    if (!arg2 || (arg2 !== 'on' && arg2 !== 'off')) {
      return {
        type: 'text',
        value: `默认提示词(CYBER_RISK_INSTRUCTION)当前${isCyberRiskEnabled() ? '开启' : '关闭'}。用法: /drill cyberrisk on|off`,
      }
    }
    const enable = arg2 === 'on'
    updateSettingsForSource('userSettings', { cyberRisk: { enabled: enable } })
    return {
      type: 'text',
      value: enable
        ? '默认提示词已开启 — 小码酱原生提示词常态注入系统提示词。'
        : '默认提示词已关闭 — CYBER_RISK_INSTRUCTION 不再注入,模型恢复默认行为。',
    }
  }

  return {
    type: 'text',
    value: [
      '用法:',
      '  /drill status               查看默认提示词开关状态',
      '  /drill cyberrisk on | off   切换默认提示词(小码酱原生提示词)',
    ].join('\n'),
  }
}
