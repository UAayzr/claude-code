import type { Command } from '../../commands.js'

const drill = {
  type: 'local',
  name: 'drill',
  description:
    '提示词开关控制台 — CYBER_RISK_INSTRUCTION 默认提示词开关。Subcommands: status/cyberrisk',
  supportsNonInteractive: false,
  load: () => import('./drill.js'),
} satisfies Command

export default drill
