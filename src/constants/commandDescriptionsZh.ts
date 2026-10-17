import { type Command, getCommandName } from '../types/command.js'

/**
 * 「/」命令菜单右侧提示文本的中文翻译表(固定中文,不跟随 /lang)。
 *
 * 覆盖范围:内置命令 + 捆绑技能。查询入口见 formatDescriptionWithSource
 * (src/commands.ts),它是 / 菜单、/help 面板、/help 打印三处 UI 的唯一出口。
 *
 * 边界规则:
 * - key 用 getCommandName(cmd)(userFacingName ?? name),插件/用户自定义命令不入表;
 * - value 不含来源后缀((workflow)/(内置) 等),由 getSourceSuffixZh 统一追加;
 * - 命令语法词与参数占位符保留英文(子命令 status/once、CLAUDE.md、MCP 等);
 * - 捆绑技能:这里只放 UI 展示用的简短中文,模型侧仍读原始英文全文指令;
 * - 不入表的动态 getter 命令(description 含运行时状态,已 in-place 中文化):
 *   fast / sandbox / passes / model / init / login / terminal-setup / break-cache / tui。
 */
export const COMMAND_DESCRIPTIONS_ZH: Readonly<Record<string, string>> = {
  // ── 内置命令(按字母序)────────────────────────────────────
  'add-dir': '添加新的工作目录',
  advisor: '配置 advisor 模型',
  'agents-platform': '管理远程计划 agent(cron 触发器)',
  triggers:
    '管理远程 agent 计划触发器(云端 cron)。需要 Claude Pro/Max/Team 订阅',
  'memory-stores':
    '管理远程记忆存储(跨设备记忆持久化)。需要 Claude Pro/Max/Team 订阅',
  'skill-store':
    '浏览并安装 Anthropic 技能市场的远程技能。需要 Claude Pro/Max/Team 订阅',
  vault: '管理云 agent 的远程凭据保险库。需要 Claude Pro/Max/Team 订阅',
  'local-vault': '管理本地加密凭据(系统钥匙串或加密文件,无需 API 密钥)',
  'local-memory':
    '管理本地记忆存储(笔记与上下文,存放于 ~/.uaayzr/local-memory/)',
  autonomy: '查看自动执行记录(主动 tick 与计划任务)',
  provider: '切换 API 提供商',
  artifacts: '列出本会话上传到 cloud-artifacts 的 HTML 产物',
  agents: '管理 agent 配置',
  branch: '在当前对话位置创建分支',
  btw: '在不打断主线对话的情况下快速问一个附带问题',
  chrome: 'Claude in Chrome(Beta)设置',
  clear: '清空对话历史,释放上下文',
  color: '设置本次会话的提示栏颜色',
  compact: '清空对话历史但保留摘要。可选:/compact [总结指示]',
  config: '打开配置面板',
  copy: '复制 Claude 的最后一条回复到剪贴板(或 /copy N 取倒数第 N 条)',
  desktop: '在 Claude Desktop 中继续当前会话',
  context: '以彩色网格可视化当前上下文占用',
  diff: '查看未提交的更改与逐轮 diff',
  doctor: '诊断并校验本机 UAayzr Code 安装与配置',
  effort: '设定模型使用的思考强度',
  exit: '退出 REPL',
  files: '列出当前上下文中包含的所有文件',
  heapdump: '导出 JS 堆快照到 ~/Desktop',
  help: '显示帮助与可用命令',
  ide: '管理 IDE 集成并显示状态',
  keybindings: '打开或创建你的按键绑定配置文件',
  lang: '设置显示语言(en/zh/auto)',
  'install-github-app': '为仓库安装 Claude GitHub Actions',
  'install-slack-app': '安装 Claude Slack 应用',
  mcp: '管理 MCP 服务器',
  memory: '编辑 Claude 记忆文件',
  mobile: '显示二维码以下载 Claude 移动端应用',
  mode: '切换交互模式(default、gentle、sharp、workhorse、token-saver、super-ai)',
  'output-style': '已废弃:请使用 /config 更改输出风格',
  'remote-env': '配置 teleport 会话的默认远程环境',
  plugin: '管理本机插件',
  'pr-comments': '获取 GitHub pull request 的评论',
  'release-notes': '查看发布说明',
  'reload-plugins': '在当前会话激活待生效的插件变更',
  rename: '重命名当前对话',
  resume: '恢复之前的对话',
  session: '显示远程会话地址与二维码',
  skills: '列出可用技能',
  status: '显示 UAayzr Code 状态(版本、模型、账号、API 连通性与工具状态)',
  statusline: '设置 UAayzr Code 的状态栏 UI',
  stickers: '订购 UAayzr Code 贴纸',
  tag: '给当前会话切换可搜索标签',
  theme: '更换主题',
  feedback: '提交关于 UAayzr Code 的反馈',
  review: '审查一个 pull request',
  ultrareview:
    '约 10–20 分钟 · 查找并验证分支缺陷。在 Claude Code on the web 中运行',
  rewind: '将代码与/或对话恢复到之前的某个点',
  'security-review': '对当前分支的待提交更改做安全审查',
  upgrade: '升级到 Max,获得更高速率限制与更多 Opus',
  'extra-usage': '配置额外用量,限额用尽时继续工作',
  'rate-limit-options': '遇到速率限制时显示选项',
  usage: '显示会话成本、套餐用量与活动统计',
  insights: '生成一份分析 UAayzr Code 会话的报告',
  vim: '在 Vim 与普通编辑模式之间切换',
  'web-tools': '配置网络搜索与网页抓取后端',
  'think-back': '你的 2025 UAayzr Code 年度回顾',
  'thinkback-play': '播放年度回顾动画',
  permissions: '管理工具权限的允许与拒绝规则',
  plan: '启用计划模式或查看当前会话计划',
  'privacy-settings': '查看并更新隐私设置',
  hooks: '查看工具事件的 hook 配置',
  export: '将当前对话导出到文件或剪贴板',
  logout: '退出当前账号',
  tasks: '列出并管理后台任务',
  summary: '生成并显示会话摘要',
  recap: '生成一行会话回顾',
  'skill-learning': '管理技能学习(观察、分析、进化)',
  'skill-search': '控制对话中的自动技能匹配',
  'autofix-pr': '自动修复 pull request 上的 CI 失败',
  commit: '创建一次 git 提交',
  'commit-push-pr': '提交、推送并打开一个 PR',
  'bridge-kick': '注入 bridge 故障状态以手动测试恢复流程',
  version: '打印本次会话运行的版本号(非自动更新下载的版本)',
  'init-verifiers': '创建代码变更的自动验证 skill',
  env: '显示当前环境、运行时与 feature flags',
  'debug-tool-call': '显示会话日志中最近 N 对工具调用(use/result)',
  'perf-issue': '截取性能与用量快照。Flags: --format=json|csv|md (默认 md)',
  issue:
    '通过 gh CLI 创建 GitHub issue。Flags: --label <label>, --assignee <user>',
  share:
    '将会话日志上传到 GitHub Gist(Flags: --public、--private、--mask-secrets 等)',
  teleport: '从 claude.ai 恢复一个 Claude Code 会话',
  onboarding: '重新执行首次配置(主题、信任、模型、MCP)',
  // ── 门控命令(feature flag)────────────────────────────────
  'web-setup': '在网页端设置 Claude Code(需要连接你的 GitHub 账号)',
  fork: '将当前会话 fork 为新的子 agent',
  buddy: '孵化一个编程伙伴宠物 · pet、off',
  poor: '切换穷鬼模式,跳过 extract_memories 与 prompt_suggestion 以节省 token',
  goal: '设置或查看驱动跨轮自动继续的持久目标',
  proactive: '切换主动(自主)模式',
  monitor: '启动后台 shell 监视器(Shift+Down 查看)',
  coordinator: '切换协调者(多 worker)模式',
  brief: '切换简报模式',
  assistant: '打开 Kairos 助手面板',
  'remote-control': '连接此终端以进行远程控制会话',
  'remote-control-server': '启动常驻的远程控制服务器(daemon),接受多会话接入',
  voice: '切换语音模式。使用 /voice doubao 选择豆包语音后端',
  ultraplan: '约 10–30 分钟 · Claude Code on the web 起草可编辑审批的高级计划',
  torch: '[内部] 开发调试命令(保留)',
  daemon: '管理后台会话与守护进程',
  job: '管理模板任务',
  'force-snip': '在当前对话点强制裁剪对话历史',
  'subscribe-pr': '订阅 GitHub PR 活动(评论、CI、审查)',
  // UDS_INBOX 系列(当前构建已禁用,保留中文以防启用)
  peers: '列出已连接的 UAayzr Code 对等节点',
  attach: '通过命名管道挂接到子 Claude CLI 实例',
  detach: '与子 CLI(或全部已连接子 CLI)解除挂接',
  send: '向已连接的子 CLI 发送消息',
  pipes: '检查管道注册表状态并切换管道选择器',
  'pipe-status': '显示当前管道连接状态',
  history: '查看已连接子 CLI 的会话历史',
  'claim-main': '为此机器声明主角色(覆盖当前主机器)',

  // ── 捆绑技能(UI 展示简短中文;模型侧仍读英文全文)──────────
  'claude-api': '用 Claude API 或 Anthropic SDK 构建应用',
  'claude-in-chrome': '自动化 Chrome 浏览器操作网页(点击、填表、截图、导航)',
  batch: '批量并行执行大型变更(5–30 个隔离分支 agent,各自开 PR)',
  'cron-list': '列出本会话的所有计划任务',
  'cron-delete': '按 ID 取消计划任务',
  debug: '启用本会话调试日志并协助诊断问题',
  dream: '手动触发记忆整理(审查、组织、精简自动记忆文件)',
  'keybindings-help':
    '自定义键盘快捷键、绑定按键或修改 ~/.uaayzr/keybindings.json',
  loop: '按固定间隔循环运行提示词或斜杠命令(如 /loop 5m /foo,默认 10m)',
  'lorem-ipsum': '生成长上下文测试用占位文本(/lorem-ipsum 50000 指定 token 数)',
  remember: '审查自动记忆并建议提升到 CLAUDE.md,清理过期/冲突条目',
  schedule: '创建、更新、列出或运行按 cron 计划执行的远程 agent',
  simplify: '审查变更代码的复用性、质量与效率并修复问题',
  skillify: '把本次会话的可重复流程沉淀为 skill(/skillify [可选描述])',
  stuck: '[仅内部] 诊断本机卡死/异常缓慢的 UAayzr Code 会话并输出报告',
  'find-flaky-tests': '找出 flaky 测试并提出修复方案',
  'review-changes': '多维度审查变更文件并逐条验证发现',
  ultracode: '进入多 agent 工作流编排模式(Workflow 工具、脚本原语、质量模式)',
  'update-config': '通过 settings.json 配置 harness 的自动化行为',
  'use-artifacts':
    '教代理何时与如何使用 artifact 工具(适用内容、上传/更新、调用流程)',
  verify: '通过运行应用验证代码变更是否达成预期',
}

/** 不可入表(description 含运行时状态,已 in-place 中文化)的键,防未来误加。 */
export const DYNAMIC_DESCRIPTION_COMMANDS = [
  'fast',
  'sandbox',
  'passes',
  'model',
  'init',
  'login',
  'terminal-setup',
  'break-cache',
  'tui',
] as const

/** 查表取中文描述;插件/MCP 命令与不在表中的命令返回 undefined(保持原文)。 */
export function getCommandDescriptionZh(cmd: Command): string | undefined {
  if (
    cmd.type === 'prompt' &&
    (cmd.source === 'plugin' || cmd.source === 'mcp')
  ) {
    return undefined
  }
  return COMMAND_DESCRIPTIONS_ZH[getCommandName(cmd)]
}

/**
 * 来源后缀的中文本地化,复刻 src/commands.ts formatDescriptionWithSource 的
 * 分支语义。返回的后缀包含前导空格,如 ' (工作流)'。
 * 注意:plugin 且有插件名时原文用的是前缀 `(${pluginName}) `(由
 * formatDescriptionWithSource 保留),此处返回空串。
 */
export function getSourceSuffixZh(cmd: Command): string {
  // 本地命令无 source,不带来源后缀(与 formatDescriptionWithSource 行为一致)
  if (cmd.type !== 'prompt') return ''
  if (cmd.kind === 'workflow') return ' (工作流)'
  if (cmd.source === 'plugin') {
    const pluginName = cmd.pluginInfo?.pluginManifest.name
    return pluginName ? '' : ' (插件)'
  }
  if (cmd.source === 'builtin' || cmd.source === 'mcp') return ''
  if (cmd.source === 'bundled') return ' (内置)'
  switch (cmd.source) {
    case 'userSettings':
      return ' (用户)'
    case 'projectSettings':
      return ' (项目)'
    case 'localSettings':
      return ' (项目,gitignore)'
    case 'flagSettings':
      return ' (CLI 参数)'
    case 'policySettings':
      return ' (托管)'
    default:
      return ''
  }
}
