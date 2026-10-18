import React from 'react';
import { Text } from '@anthropic/ink';
import { extractMcpToolDisplayName, getMcpDisplayName } from '../../services/mcp/mcpStringUtils.js';
import { filterToolsByServer } from '../../services/mcp/utils.js';
import { useAppState } from '../../state/AppState.js';
import type { Tool } from '../../Tool.js';
import { plural } from '../../utils/stringUtils.js';
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js';
import { Select } from '../CustomSelect/index.js';
import { Byline, Dialog, KeyboardShortcutHint } from '@anthropic/ink';
import type { ServerInfo } from './types.js';

type Props = {
  server: ServerInfo;
  onSelectTool: (tool: Tool, index: number) => void;
  onBack: () => void;
};

export function MCPToolListView({ server, onSelectTool, onBack }: Props): React.ReactNode {
  const mcpTools = useAppState(s => s.mcp.tools);

  const serverTools = React.useMemo(() => {
    if (server.client.type !== 'connected') return [];
    return filterToolsByServer(mcpTools, server.name);
  }, [server, mcpTools]);

  const toolOptions = serverTools.map((tool, index) => {
    const toolName = getMcpDisplayName(tool.name, server.name);
    const fullDisplayName = tool.userFacingName ? tool.userFacingName({}) : toolName;
    // Extract just the tool display name without server prefix
    const displayName = extractMcpToolDisplayName(fullDisplayName);

    const isReadOnly = tool.isReadOnly?.({}) ?? false;
    const isDestructive = tool.isDestructive?.({}) ?? false;
    const isOpenWorld = tool.isOpenWorld?.({}) ?? false;

    const annotations = [];
    if (isReadOnly) annotations.push('只读');
    if (isDestructive) annotations.push('危险');
    if (isOpenWorld) annotations.push('开放世界');

    return {
      label: displayName,
      value: index.toString(),
      description: annotations.length > 0 ? annotations.join(', ') : undefined,
      descriptionColor: isDestructive ? 'error' : isReadOnly ? 'success' : undefined,
    };
  });

  return (
    <Dialog
      title={`${server.name} 的工具`}
      subtitle={`${serverTools.length} 个工具`}
      onCancel={onBack}
      inputGuide={exitState =>
        exitState.pending ? (
          <Text>再次按 {exitState.keyName} 退出</Text>
        ) : (
          <Byline>
            <KeyboardShortcutHint shortcut="↑↓" action="导航" />
            <KeyboardShortcutHint shortcut="Enter" action="选择" />
            <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="返回" />
          </Byline>
        )
      }
    >
      {serverTools.length === 0 ? (
        <Text dimColor>没有可用工具</Text>
      ) : (
        <Select
          options={toolOptions}
          onChange={value => {
            const index = parseInt(value, 10);
            const tool = serverTools[index];
            if (tool) {
              onSelectTool(tool, index);
            }
          }}
          onCancel={onBack}
        />
      )}
    </Dialog>
  );
}
