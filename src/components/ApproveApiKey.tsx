import React from 'react';
import { Text, Dialog } from '@anthropic/ink';
import { saveGlobalConfig } from '../utils/config.js';
import { useNotifyAfterTimeout } from '../hooks/useNotifyAfterTimeout.js';
import { Select } from './CustomSelect/index.js';

type Props = {
  customApiKeyTruncated: string;
  onDone(approved: boolean): void;
};

export function ApproveApiKey({ customApiKeyTruncated, onDone }: Props): React.ReactNode {
  useNotifyAfterTimeout('UAayzr Code 需要你批准使用此 API 密钥', 'permission_prompt');
  function onChange(value: 'yes' | 'no') {
    switch (value) {
      case 'yes': {
        saveGlobalConfig(current => ({
          ...current,
          customApiKeyResponses: {
            ...current.customApiKeyResponses,
            approved: [...(current.customApiKeyResponses?.approved ?? []), customApiKeyTruncated],
          },
        }));
        onDone(true);
        break;
      }
      case 'no': {
        saveGlobalConfig(current => ({
          ...current,
          customApiKeyResponses: {
            ...current.customApiKeyResponses,
            rejected: [...(current.customApiKeyResponses?.rejected ?? []), customApiKeyTruncated],
          },
        }));
        onDone(false);
        break;
      }
    }
  }

  return (
    <Dialog title="检测到环境中存在自定义 API 密钥" color="warning" onCancel={() => onChange('no')}>
      <Text>
        <Text bold>ANTHROPIC_API_KEY</Text>
        <Text>: sk-ant-...{customApiKeyTruncated}</Text>
      </Text>
      <Text>你想使用此 API 密钥吗？</Text>
      <Select
        defaultValue="no"
        defaultFocusValue="no"
        options={[
          { label: 'Yes', value: 'yes' },
          {
            label: (
              <Text>
                No (<Text bold>recommended</Text>)
              </Text>
            ),
            value: 'no',
          },
        ]}
        onChange={value => onChange(value as 'yes' | 'no')}
        onCancel={() => onChange('no')}
      />
    </Dialog>
  );
}
