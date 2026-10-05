import React from 'react';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js';
import { getSettings_DEPRECATED, updateSettingsForSource } from '../utils/settings/settings.js';
import { useNotifyAfterTimeout } from '../hooks/useNotifyAfterTimeout.js';
import { Select } from './CustomSelect/index.js';
import { Dialog } from '@anthropic/ink';
import { MCPServerDialogCopy } from './MCPServerDialogCopy.js';

type Props = {
  serverName: string;
  onDone(): void;
};

export function MCPServerApprovalDialog({ serverName, onDone }: Props): React.ReactNode {
  useNotifyAfterTimeout(`UAayzr Code 需要你批准启用 MCP 服务器 ${serverName}`, 'permission_prompt');
  function onChange(value: 'yes' | 'yes_all' | 'no') {
    logEvent('tengu_mcp_dialog_choice', {
      choice: value as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });

    switch (value) {
      case 'yes':
      case 'yes_all': {
        // Get current enabled servers from settings
        const currentSettings = getSettings_DEPRECATED() || {};
        const enabledServers = currentSettings.enabledMcpjsonServers || [];

        // Add server if not already enabled
        if (!enabledServers.includes(serverName)) {
          updateSettingsForSource('localSettings', {
            enabledMcpjsonServers: [...enabledServers, serverName],
          });
        }

        if (value === 'yes_all') {
          updateSettingsForSource('localSettings', {
            enableAllProjectMcpServers: true,
          });
        }
        onDone();
        break;
      }
      case 'no': {
        // Get current disabled servers from settings
        const currentSettings = getSettings_DEPRECATED() || {};
        const disabledServers = currentSettings.disabledMcpjsonServers || [];

        // Add server if not already disabled
        if (!disabledServers.includes(serverName)) {
          updateSettingsForSource('localSettings', {
            disabledMcpjsonServers: [...disabledServers, serverName],
          });
        }
        onDone();
        break;
      }
    }
  }

  return (
    <Dialog
      title={`在 .uaayzr/mcp.json 中发现新的 MCP 服务器：${serverName}`}
      color="warning"
      onCancel={() => onChange('no')}
    >
      <MCPServerDialogCopy />

      <Select
        options={[
          {
            label: `Use this and all future MCP servers in this project`,
            value: 'yes_all',
          },
          { label: `Use this MCP server`, value: 'yes' },
          { label: `Continue without using this MCP server`, value: 'no' },
        ]}
        onChange={value => onChange(value as 'yes_all' | 'yes' | 'no')}
        onCancel={() => onChange('no')}
      />
    </Dialog>
  );
}
