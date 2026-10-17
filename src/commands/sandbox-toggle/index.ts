import figures from 'figures'
import type { Command } from '../../commands.js'
import { SandboxManager } from '../../utils/sandbox/sandbox-adapter.js'

const command = {
  name: 'sandbox',
  get description() {
    const currentlyEnabled = SandboxManager.isSandboxingEnabled()
    const autoAllow = SandboxManager.isAutoAllowBashIfSandboxedEnabled()
    const allowUnsandboxed = SandboxManager.areUnsandboxedCommandsAllowed()
    const isLocked = SandboxManager.areSandboxSettingsLockedByPolicy()
    const hasDeps = SandboxManager.checkDependencies().errors.length === 0

    // Show warning icon if dependencies missing, otherwise enabled/disabled status
    let icon: string
    if (!hasDeps) {
      icon = figures.warning
    } else {
      icon = currentlyEnabled ? figures.tick : figures.circle
    }

    let statusText = '沙箱未启用'
    if (currentlyEnabled) {
      statusText = autoAllow ? '沙箱已启用(自动放行)' : '沙箱已启用'

      // 追加未沙箱回退状态
      statusText += allowUnsandboxed ? ',允许未沙箱回退' : ''
    }

    if (isLocked) {
      statusText += ' (托管)'
    }

    return `${icon} ${statusText} (⏎ 配置)`
  },
  argumentHint: '排除 "命令模式"',
  get isHidden() {
    return (
      !SandboxManager.isSupportedPlatform() ||
      !SandboxManager.isPlatformInEnabledList()
    )
  },
  immediate: true,
  type: 'local-jsx',
  load: () => import('./sandbox-toggle.js'),
} satisfies Command

export default command
