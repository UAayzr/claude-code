import { registerBundledSkill } from '../bundledSkills.js'

// Prompt text contains `ps` commands as instructions for Claude to run,
// not commands this file executes.
// eslint-disable-next-line custom-rules/no-direct-ps-commands
const STUCK_PROMPT = `# /stuck — diagnose frozen/slow UAayzr Code sessions

The user thinks another UAayzr Code session on this machine is frozen, stuck, or very slow. Investigate and report the findings to the user.

## What to look for

Scan for other UAayzr Code processes (excluding the current one — PID is in \`process.pid\` but for shell commands just exclude the PID you see running this prompt). Process names are typically \`claude\` (installed) or \`cli\` (native dev build).

Signs of a stuck session:
- **High CPU (≥90%) sustained** — likely an infinite loop. Sample twice, 1-2s apart, to confirm it's not a transient spike.
- **Process state \`D\` (uninterruptible sleep)** — often an I/O hang. The \`state\` column in \`ps\` output; first character matters (ignore modifiers like \`+\`, \`s\`, \`<\`).
- **Process state \`T\` (stopped)** — user probably hit Ctrl+Z by accident.
- **Process state \`Z\` (zombie)** — parent isn't reaping.
- **Very high RSS (≥4GB)** — possible memory leak making the session sluggish.
- **Stuck child process** — a hung \`git\`, \`node\`, or shell subprocess can freeze the parent. Check \`pgrep -lP <pid>\` for each session.

## Investigation steps

1. **List all UAayzr Code processes** (macOS/Linux):
   \`\`\`
   ps -axo pid=,pcpu=,rss=,etime=,state=,comm=,command= | grep -E '(claude|cli)' | grep -v grep
   \`\`\`
   Filter to rows where \`comm\` is \`claude\` or (\`cli\` AND the command path contains "claude").

2. **For anything suspicious**, gather more context:
   - Child processes: \`pgrep -lP <pid>\`
   - If high CPU: sample again after 1-2s to confirm it's sustained
   - If a child looks hung (e.g., a git command), note its full command line with \`ps -p <child_pid> -o command=\`
   - Check the session's debug log if you can infer the session ID: \`~/.uaayzr/debug/<session-id>.txt\` (the last few hundred lines often show what it was doing before hanging)

3. **Consider a stack dump** for a truly frozen process (advanced, optional):
   - macOS: \`sample <pid> 3\` gives a 3-second native stack sample
   - This is big — only grab it if the process is clearly hung and you want to know *why*

## Report

**Only report if you actually found something stuck.** If every session looks healthy, tell the user that directly.

If you did find a stuck/slow session, present a structured diagnostic report to the user:

1. **Headline** — one short line: hostname, UAayzr Code version, and a terse symptom (e.g. "session PID 12345 pegged at 100% CPU for 10min" or "git subprocess hung in D state"). No code blocks, no details.
2. **Details** — the full diagnostic dump. Include:
   - PID, CPU%, RSS, state, uptime, command line, child processes
   - Your diagnosis of what's likely wrong
   - Relevant debug log tail or \`sample\` output if you captured it

## Notes
- Don't kill or signal any processes — this is diagnostic only.
- If the user gave an argument (e.g., a specific PID or symptom), focus there first.
`

export function registerStuckSkill(): void {
  if (process.env.USER_TYPE !== 'ant') {
    return
  }

  registerBundledSkill({
    name: 'stuck',
    description:
      '[ANT-ONLY] Investigate frozen/stuck/slow UAayzr Code sessions on this machine and present a diagnostic report.',
    userInvocable: true,
    async getPromptForCommand(args) {
      let prompt = STUCK_PROMPT
      if (args) {
        prompt += `\n## User-provided context\n\n${args}\n`
      }
      return [{ type: 'text', text: prompt }]
    },
  })
}
