import figures from 'figures';
import * as React from 'react';
import { Box, color, Text, useTheme } from '@anthropic/ink';
import { plural } from '../../utils/stringUtils.js';
import type { UnifiedInstalledItem } from './unifiedTypes.js';

type Props = {
  item: UnifiedInstalledItem;
  isSelected: boolean;
};

export function UnifiedInstalledCell({ item, isSelected }: Props): React.ReactNode {
  const [theme] = useTheme();

  if (item.type === 'plugin') {
    // Status icon and text
    let statusIcon: string;
    let statusText: string;

    // Show pending toggle status if set, otherwise show current status
    if (item.pendingToggle) {
      statusIcon = color('suggestion', theme)(figures.arrowRight);
      statusText = item.pendingToggle === 'will-enable' ? '将启用' : '将禁用';
    } else if (item.errorCount > 0) {
      statusIcon = color('error', theme)(figures.cross);
      statusText = `${item.errorCount} 个错误`;
    } else if (!item.isEnabled) {
      statusIcon = color('inactive', theme)(figures.radioOff);
      statusText = '已禁用';
    } else {
      statusIcon = color('success', theme)(figures.tick);
      statusText = '已启用';
    }

    return (
      <Box>
        <Text color={isSelected ? 'suggestion' : undefined}>{isSelected ? `${figures.pointer} ` : '  '}</Text>
        <Text color={isSelected ? 'suggestion' : undefined}>{item.name}</Text>
        <Text dimColor={!isSelected}>
          {' '}
          <Text backgroundColor="userMessageBackground">插件</Text>
        </Text>
        <Text dimColor> · {item.marketplace}</Text>
        <Text dimColor={!isSelected}> · {statusIcon} </Text>
        <Text dimColor={!isSelected}>{statusText}</Text>
      </Box>
    );
  }

  if (item.type === 'flagged-plugin') {
    const statusIcon = color('warning', theme)(figures.warning);

    return (
      <Box>
        <Text color={isSelected ? 'suggestion' : undefined}>{isSelected ? `${figures.pointer} ` : '  '}</Text>
        <Text color={isSelected ? 'suggestion' : undefined}>{item.name}</Text>
        <Text dimColor={!isSelected}>
          {' '}
          <Text backgroundColor="userMessageBackground">插件</Text>
        </Text>
        <Text dimColor> · {item.marketplace}</Text>
        <Text dimColor={!isSelected}> · {statusIcon} </Text>
        <Text dimColor={!isSelected}>已移除</Text>
      </Box>
    );
  }

  if (item.type === 'failed-plugin') {
    const statusIcon = color('error', theme)(figures.cross);
    const statusText = `加载失败 · ${item.errorCount} 个错误`;

    return (
      <Box>
        <Text color={isSelected ? 'suggestion' : undefined}>{isSelected ? `${figures.pointer} ` : '  '}</Text>
        <Text color={isSelected ? 'suggestion' : undefined}>{item.name}</Text>
        <Text dimColor={!isSelected}>
          {' '}
          <Text backgroundColor="userMessageBackground">插件</Text>
        </Text>
        <Text dimColor> · {item.marketplace}</Text>
        <Text dimColor={!isSelected}> · {statusIcon} </Text>
        <Text dimColor={!isSelected}>{statusText}</Text>
      </Box>
    );
  }

  // MCP server
  let statusIcon: string;
  let statusText: string;

  if (item.status === 'connected') {
    statusIcon = color('success', theme)(figures.tick);
    statusText = '已连接';
  } else if (item.status === 'disabled') {
    statusIcon = color('inactive', theme)(figures.radioOff);
    statusText = '已禁用';
  } else if (item.status === 'pending') {
    statusIcon = color('inactive', theme)(figures.radioOff);
    statusText = '连接中…';
  } else if (item.status === 'needs-auth') {
    statusIcon = color('warning', theme)(figures.triangleUpOutline);
    statusText = '按 Enter 授权';
  } else {
    statusIcon = color('error', theme)(figures.cross);
    statusText = '失败';
  }

  // Indented MCPs (child of a plugin)
  if (item.indented) {
    return (
      <Box>
        <Text color={isSelected ? 'suggestion' : undefined}>{isSelected ? `${figures.pointer} ` : '  '}</Text>
        <Text dimColor={!isSelected}>└ </Text>
        <Text color={isSelected ? 'suggestion' : undefined}>{item.name}</Text>
        <Text dimColor={!isSelected}>
          {' '}
          <Text backgroundColor="userMessageBackground">MCP</Text>
        </Text>
        <Text dimColor={!isSelected}> · {statusIcon} </Text>
        <Text dimColor={!isSelected}>{statusText}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color={isSelected ? 'suggestion' : undefined}>{isSelected ? `${figures.pointer} ` : '  '}</Text>
      <Text color={isSelected ? 'suggestion' : undefined}>{item.name}</Text>
      <Text dimColor={!isSelected}>
        {' '}
        <Text backgroundColor="userMessageBackground">MCP</Text>
      </Text>
      <Text dimColor={!isSelected}> · {statusIcon} </Text>
      <Text dimColor={!isSelected}>{statusText}</Text>
    </Box>
  );
}
