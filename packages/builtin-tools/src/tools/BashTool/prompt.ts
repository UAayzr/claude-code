import { feature } from 'bun:bundle'
import { isEnvTruthy } from 'src/utils/envUtils.js'
import { hasEmbeddedSearchTools } from 'src/utils/embeddedTools.js'
import {
  getDefaultBashTimeoutMs,
  getMaxBashTimeoutMs,
} from 'src/utils/timeouts.js'

export function getDefaultTimeoutMs(): number {
  return getDefaultBashTimeoutMs()
}

export function getMaxTimeoutMs(): number {
  return getMaxBashTimeoutMs()
}

function getBackgroundUsageNote(): string | null {
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)) {
    return null
  }
  return "You can use the `run_in_background` parameter to run the command in the background if you don't need the result immediately; you'll be notified when it completes. No '&' at the end of the command needed when using this parameter."
}

// Must mirror the validateInput gate in BashTool.tsx (feature('MONITOR_TOOL') &&
// !isBackgroundTasksDisabled && !run_in_background) — describing a block that
// isn't active would be wrong information.
function getSleepBlockedNote(): string | null {
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)) {
    return null
  }
  return feature('MONITOR_TOOL')
    ? 'Foreground `sleep N` (N ≥ 2) as the first command is blocked: use `run_in_background` for long-running commands, or Monitor to stream events from a background process. For a deliberate delay (rate limiting, pacing), keep it under 2 seconds.'
    : null
}

// 对齐官方最新版(见 .zawu/bash.txt):接口事实 + 必要行为边界,零教学散文。
// git 安全协议由 /commit、/commit-push-pr 命令承载;系统段 getActionsSection
// 常驻覆盖 destructive git 操作兜底。
export function getSimplePrompt(): string {
  // Ant-native builds alias find/grep to embedded bfs/ugrep, so the avoid
  // list is shorter there (find/grep are legitimate Bash invocations).
  const embedded = hasEmbeddedSearchTools()
  const avoidCommands = embedded
    ? '`cat`, `head`, `tail`, `sed`, `awk`, or `echo`'
    : '`find`, `grep`, `cat`, `head`, `tail`, `sed`, `awk`, or `echo`'
  const backgroundNote = getBackgroundUsageNote()
  const sleepBlockedNote = getSleepBlockedNote()

  return `Executes a bash command and returns its output.

This tool runs Git Bash (POSIX sh), not cmd.exe or PowerShell. Use Unix shell syntax: \`/dev/null\` not \`NUL\`, forward slashes, \`$VAR\` not \`%VAR%\` or \`$env:VAR\`. Do not use PowerShell here-strings (\`@'…'@\`) or backtick continuation here — for multi-line strings use a heredoc.

- Working directory persists between calls, but prefer absolute paths — \`cd\` in a compound command can trigger a permission prompt. Shell state (env vars, functions) does not persist; the shell is initialized from the user's profile.
- IMPORTANT: Avoid using this tool to run ${avoidCommands} commands, unless explicitly instructed or after you have verified that a dedicated tool cannot accomplish your task. Instead, use the appropriate dedicated tool as this will provide a much better experience for the user.
- Command output is displayed to you, not reliably to the user.
- \`timeout\` is in milliseconds: default ${getDefaultTimeoutMs()}, max ${getMaxTimeoutMs()}.
${sleepBlockedNote ? `- ${sleepBlockedNote}\n` : ''}${backgroundNote ? `- ${backgroundNote}\n` : ''}
# Git
- Interactive flags (\`-i\`, e.g. \`git rebase -i\`, \`git add -i\`) are not supported in this environment.
- Use the \`gh\` CLI for GitHub operations (PRs, issues, API).
- Commit or push only when the user asks. If on the default branch, branch first.
- End git commit messages and PR bodies with the attribution lines given in the conversation's system-reminder, when one is present.`
}
