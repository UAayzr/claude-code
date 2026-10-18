import figures from 'figures';
import React, { useEffect, useState } from 'react';
import type { CommandResultDisplay } from '../../commands.js';
import { Box, color, Text, useTheme } from '@anthropic/ink';
import { useMcpReconnect } from '../../services/mcp/MCPConnectionManager.js';
import { useAppStateStore } from '../../state/AppState.js';
import { Spinner } from '../Spinner.js';

type Props = {
  serverName: string;
  onComplete: (result?: string, options?: { display?: CommandResultDisplay }) => void;
};

export function MCPReconnect({ serverName, onComplete }: Props): React.ReactNode {
  const [theme] = useTheme();
  const store = useAppStateStore();
  const reconnectMcpServer = useMcpReconnect();
  const [isReconnecting, setIsReconnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function attemptReconnect() {
      try {
        // Check if server exists. Read via store.getState() instead of a
        // reactive selector so this effect does not re-fire when
        // reconnectMcpServer updates mcp.clients via onConnectionAttempt.
        const server = store.getState().mcp.clients.find(c => c.name === serverName);
        if (!server) {
          setError(`未找到 MCP 服务器 "${serverName}"`);
          setIsReconnecting(false);
          onComplete(`未找到 MCP 服务器 "${serverName}"`);
          return;
        }

        // Attempt reconnection
        const result = await reconnectMcpServer(serverName);

        switch (result.client.type) {
          case 'connected':
            setIsReconnecting(false);
            onComplete(`已成功重新连接到 ${serverName}`);
            break;
          case 'needs-auth':
            setError(`${serverName} 需要认证`);
            setIsReconnecting(false);
            onComplete(`${serverName} 需要认证。使用 /mcp 进行认证。`);
            break;
          case 'pending':
          case 'failed':
          case 'disabled':
            setError(`重新连接到 ${serverName} 失败`);
            setIsReconnecting(false);
            onComplete(`重新连接到 ${serverName} 失败`);
            break;
        }
      } catch (err) {
        // Only catch actual errors (like server not found)
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        setIsReconnecting(false);
        onComplete(`错误: ${errorMessage}`);
      }
    }

    void attemptReconnect();
  }, [serverName, reconnectMcpServer, store, onComplete]);

  if (isReconnecting) {
    return (
      <Box flexDirection="column" gap={1} padding={1}>
        <Text color="text">
          正在重新连接到 <Text bold>{serverName}</Text>
        </Text>
        <Box>
          <Spinner />
          <Text> 正在建立到 MCP 服务器的连接</Text>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" gap={1} padding={1}>
        <Box>
          <Text>{color('error', theme)(figures.cross)} </Text>
          <Text color="error">重新连接到 {serverName} 失败</Text>
        </Box>
        <Text dimColor>错误: {error}</Text>
      </Box>
    );
  }

  return null;
}
