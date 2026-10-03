import type { ContentBlockParam } from '@anthropic-ai/sdk/resources';
import { randomUUID } from 'crypto';
import * as React from 'react';
import { BashModeProgress } from 'src/components/BashModeProgress.js';
import type { SetToolJSXFn } from 'src/Tool.js';
import { BashTool } from '@claude-code-best/builtin-tools/tools/BashTool/BashTool.js';
import type { AttachmentMessage, SystemMessage, UserMessage } from 'src/types/message.js';
import type { ShellProgress } from 'src/types/tools.js';
import { logEvent } from '../../services/analytics/index.js';
import { errorMessage, ShellError } from '../errors.js';
import {
  createSyntheticUserCaveatMessage,
  createUserInterruptionMessage,
  createUserMessage,
  prepareUserContent,
} from '../messages.js';
import { resolveDefaultShell } from '../shell/resolveDefaultShell.js';
import { isPowerShellToolEnabled } from '../shell/shellToolUtils.js';
import { processToolResultBlock } from '../toolResultStorage.js';
import { escapeXml } from '../xml.js';
import type { ProcessUserInputContext } from './processUserInput.js';

export async function processBashCommand(
  inputString: string,
  precedingInputBlocks: ContentBlockParam[],
  attachmentMessages: AttachmentMessage[],
  context: ProcessUserInputContext,
  setToolJSX: SetToolJSXFn,
): Promise<{
  messages: (UserMessage | AttachmentMessage | SystemMessage)[];
  shouldQuery: boolean;
}> {
  // Shell routing (docs/design/ps-shell-selection.md §5.2): consult
  // defaultShell, fall back to bash. isPowerShellToolEnabled() applies the
  // same platform + env-var gate as tools.ts so input-box routing matches
  // tool-list visibility. Computed up front so telemetry records the
  // actual shell, not the raw setting.
  const usePowerShell = isPowerShellToolEnabled() && resolveDefaultShell() === 'powershell';

  logEvent('tengu_input_bash', { powershell: usePowerShell });

  const userMessage = createUserMessage({
    content: prepareUserContent({
      inputString: `<bash-input>${inputString}</bash-input>`,
      precedingInputBlocks,
    }),
  });

  // ctrl+b to background indicator
  // 注意：变量名不能叫 jsx —— Bun.build 会把 JSX runtime 绑定和同名局部
  // 变量都重命名成 jsx2，产物里 JSX 渲染变成对 undefined 的调用，且发生
  // 在 try 之外 → `!` 命令回车后完全无反应（见 dist/chunk-7cb4h067.js）。
  let bashModeJSX: React.ReactNode;

  try {
    // Just show initial UI（在 try 内：构建态任何异常都走 catch 出反馈，
    // 而不是静默冒泡吞掉输入）
    setToolJSX({
      jsx: <BashModeProgress input={inputString} progress={null} verbose={context.options.verbose} />,
      shouldHidePromptInput: false,
    });

    const bashModeContext: ProcessUserInputContext = {
      ...context,
      // TODO: Clean up this hack
      setToolJSX: _ => {
        bashModeJSX = _?.jsx;
      },
    };

    // Progress UI — shared across both shell backends (both emit ShellProgress)
    const onProgress = (progress: { data: ShellProgress }) => {
      setToolJSX({
        jsx: (
          <>
            <BashModeProgress input={inputString!} progress={progress.data} verbose={context.options.verbose} />
            {bashModeJSX}
          </>
        ),
        shouldHidePromptInput: false,
        showSpinner: false,
      });
    };

    // User-initiated `!` commands run outside sandbox. Both shell tools honor
    // dangerouslyDisableSandbox (checked against areUnsandboxedCommandsAllowed()
    // in shouldUseSandbox.ts). PS sandbox is Linux/macOS/WSL2 only — on Windows
    // native, shouldUseSandbox() returns false regardless (unsupported platform).
    // Lazy-require PowerShellTool so its ~300KB chunk only loads when the
    // user has actually selected the powershell default shell.
    type PSMod = typeof import('@claude-code-best/builtin-tools/tools/PowerShellTool/PowerShellTool.js');
    let PowerShellTool: PSMod['PowerShellTool'] | null = null;
    if (usePowerShell) {
      /* eslint-disable @typescript-eslint/no-require-imports */
      PowerShellTool = (require('@claude-code-best/builtin-tools/tools/PowerShellTool/PowerShellTool.js') as PSMod)
        .PowerShellTool;
      /* eslint-enable @typescript-eslint/no-require-imports */
    }
    const shellTool = PowerShellTool ?? BashTool;

    const response = PowerShellTool
      ? await PowerShellTool.call(
          { command: inputString, dangerouslyDisableSandbox: true },
          bashModeContext,
          undefined,
          undefined,
          onProgress,
        )
      : await BashTool.call(
          {
            command: inputString,
            dangerouslyDisableSandbox: true,
          },
          bashModeContext,
          undefined,
          undefined,
          onProgress,
        );
    const data = response.data;

    if (!data) {
      throw new Error('No result received from shell command');
    }

    const stderr = data.stderr;
    // Reuse the same formatting pipeline as inline !`cmd` bash (promptShellExecution)
    // and model-initiated Bash. When BashTool.call() persists large output to disk,
    // data.persistedOutputPath is set and the formatter wraps in <persisted-output>.
    // Pass stderr:'' to keep it separate for the <bash-stderr> UI tag.
    const mapped = await processToolResultBlock(shellTool, { ...data, stderr: '' }, randomUUID());
    // mapped.content may contain our own <persisted-output> wrapper (trusted
    // XML from buildLargeToolResultMessage). Escaping it would turn structural
    // tags into &lt;persisted-output&gt;, breaking the model's parse and
    // UserBashOutputMessage's extractTag. Escape the raw fallback only.
    const stdout = typeof mapped.content === 'string' ? mapped.content : escapeXml(data.stdout);
    return {
      messages: [
        createSyntheticUserCaveatMessage(),
        userMessage,
        ...attachmentMessages,
        createUserMessage({
          content: `<bash-stdout>${stdout}</bash-stdout><bash-stderr>${escapeXml(stderr)}</bash-stderr>`,
        }),
      ],
      shouldQuery: false,
    };
  } catch (e) {
    if (e instanceof ShellError) {
      if (e.interrupted) {
        return {
          messages: [
            createSyntheticUserCaveatMessage(),
            userMessage,
            createUserInterruptionMessage({ toolUse: false }),
            ...attachmentMessages,
          ],
          shouldQuery: false,
        };
      }
      return {
        messages: [
          createSyntheticUserCaveatMessage(),
          userMessage,
          ...attachmentMessages,
          createUserMessage({
            content: `<bash-stdout>${escapeXml(e.stdout)}</bash-stdout><bash-stderr>${escapeXml(e.stderr)}</bash-stderr>`,
          }),
        ],
        shouldQuery: false,
      };
    }
    return {
      messages: [
        createSyntheticUserCaveatMessage(),
        userMessage,
        ...attachmentMessages,
        createUserMessage({
          content: `<bash-stderr>Command failed: ${escapeXml(errorMessage(e))}</bash-stderr>`,
        }),
      ],
      shouldQuery: false,
    };
  } finally {
    setToolJSX(null);
  }
}
