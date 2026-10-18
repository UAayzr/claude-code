import React from 'react';
import { Box, Text } from '@anthropic/ink';
import { extractMcpToolDisplayName, getMcpDisplayName } from '../../services/mcp/mcpStringUtils.js';
import type { Tool } from '../../Tool.js';
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js';
import { Dialog } from '@anthropic/ink';
import type { ServerInfo } from './types.js';

type Props = {
  tool: Tool;
  server: ServerInfo;
  onBack: () => void;
};

export function MCPToolDetailView({ tool, server, onBack }: Props): React.ReactNode {
  const [toolDescription, setToolDescription] = React.useState<string>('');

  const toolName = getMcpDisplayName(tool.name, server.name);
  const fullDisplayName = tool.userFacingName ? tool.userFacingName({}) : toolName;
  const displayName = extractMcpToolDisplayName(fullDisplayName);

  const isReadOnly = tool.isReadOnly?.({}) ?? false;
  const isDestructive = tool.isDestructive?.({}) ?? false;
  const isOpenWorld = tool.isOpenWorld?.({}) ?? false;

  React.useEffect(() => {
    async function loadDescription() {
      try {
        const desc = await tool.description(
          {},
          {
            isNonInteractiveSession: false,
            toolPermissionContext: {
              mode: 'default' as const,
              additionalWorkingDirectories: new Map(),
              alwaysAllowRules: {},
              alwaysDenyRules: {},
              alwaysAskRules: {},
              isBypassPermissionsModeAvailable: false,
            },
            tools: [],
          },
        );
        setToolDescription(desc);
      } catch {
        setToolDescription('加载描述失败');
      }
    }
    void loadDescription();
  }, [tool]);

  const titleContent = (
    <>
      {displayName}
      {isReadOnly && <Text color="success"> [只读]</Text>}
      {isDestructive && <Text color="error"> [危险]</Text>}
      {isOpenWorld && <Text dimColor> [开放世界]</Text>}
    </>
  );

  return (
    <Dialog
      title={titleContent}
      subtitle={server.name}
      onCancel={onBack}
      inputGuide={exitState =>
        exitState.pending ? (
          <Text>再次按 {exitState.keyName} 退出</Text>
        ) : (
          <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="返回" />
        )
      }
    >
      <Box flexDirection="column">
        <Box>
          <Text bold>工具名: </Text>
          <Text dimColor>{toolName}</Text>
        </Box>

        <Box>
          <Text bold>全名: </Text>
          <Text dimColor>{tool.name}</Text>
        </Box>

        {toolDescription && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>描述:</Text>
            <Text wrap="wrap">{toolDescription}</Text>
          </Box>
        )}

        {tool.inputJSONSchema &&
          tool.inputJSONSchema.properties &&
          Object.keys(tool.inputJSONSchema.properties).length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>参数:</Text>
              <Box marginLeft={2} flexDirection="column">
                {Object.entries(tool.inputJSONSchema.properties).map(([key, value]) => {
                  const required = tool.inputJSONSchema?.required as string[] | undefined;
                  const isRequired = required?.includes(key);
                  return (
                    <Text key={key}>
                      • {key}
                      {isRequired && <Text dimColor> (必填)</Text>}:{' '}
                      <Text dimColor>
                        {typeof value === 'object' && value && 'type' in value ? String(value.type) : '未知'}
                      </Text>
                      {typeof value === 'object' && value && 'description' in value && (
                        <Text dimColor> - {String(value.description)}</Text>
                      )}
                    </Text>
                  );
                })}
              </Box>
            </Box>
          )}
      </Box>
    </Dialog>
  );
}
