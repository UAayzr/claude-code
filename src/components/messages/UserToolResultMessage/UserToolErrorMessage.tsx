import { feature } from 'bun:bundle';
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import * as React from 'react';
import { Text } from '@anthropic/ink';
import { filterToolProgressMessages, type Tool, type Tools } from '../../../Tool.js';
import type { ProgressMessage } from '../../../types/message.js';
import {
  extractClassifierDenialReason,
  INTERRUPT_MESSAGE_FOR_TOOL_USE,
  isClassifierDenial,
  PLAN_REJECTION_PREFIX,
  REJECT_MESSAGE_WITH_REASON_PREFIX,
} from '../../../utils/messages.js';
import { FallbackToolUseErrorMessage } from '../../FallbackToolUseErrorMessage.js';
import { InterruptedByUser } from '../../InterruptedByUser.js';
import { MessageResponse } from '../../MessageResponse.js';
import { RejectedPlanMessage } from './RejectedPlanMessage.js';
import { RejectedToolUseMessage } from './RejectedToolUseMessage.js';

type Props = {
  progressMessagesForMessage: ProgressMessage[];
  tool?: Tool; // undefined when resuming an old conversation that uses an old tool
  tools: Tools;
  param: ToolResultBlockParam;
  verbose: boolean;
  isTranscriptMode?: boolean;
};

export function UserToolErrorMessage({
  progressMessagesForMessage,
  tool,
  tools,
  param,
  verbose,
  isTranscriptMode,
}: Props): React.ReactNode {
  if (typeof param.content === 'string' && param.content.includes(INTERRUPT_MESSAGE_FOR_TOOL_USE)) {
    return (
      <MessageResponse height={1}>
        <InterruptedByUser />
      </MessageResponse>
    );
  }

  if (typeof param.content === 'string' && param.content.startsWith(PLAN_REJECTION_PREFIX)) {
    // Extract the plan content from the error message
    const planContent = param.content.substring(PLAN_REJECTION_PREFIX.length);
    return <RejectedPlanMessage plan={planContent} />;
  }

  if (typeof param.content === 'string' && param.content.startsWith(REJECT_MESSAGE_WITH_REASON_PREFIX)) {
    return <RejectedToolUseMessage />;
  }

  if (feature('TRANSCRIPT_CLASSIFIER') && typeof param.content === 'string' && isClassifierDenial(param.content)) {
    // Show the classifier's actual reason to the user. The full message
    // (with workaround guidance and rule hints) still goes to the model via
    // the tool_result; here we render only the reason.
    const reason = extractClassifierDenialReason(param.content);
    return (
      <MessageResponse>
        <Text wrap="wrap">
          <Text dimColor>Denied by auto mode classifier</Text>
          {reason ? <Text color="subtle">: {reason}</Text> : null}
        </Text>
      </MessageResponse>
    );
  }

  return (
    tool?.renderToolUseErrorMessage?.(param.content, {
      progressMessagesForMessage: filterToolProgressMessages(progressMessagesForMessage),
      tools,
      verbose,
      isTranscriptMode,
    }) ?? <FallbackToolUseErrorMessage result={param.content} verbose={verbose} />
  );
}
