import React from 'react';
import { Box, Text } from '@anthropic/ink';
import { Byline } from '@anthropic/ink';

type Props = {
  serverToolsCount: number;
  serverPromptsCount: number;
  serverResourcesCount: number;
};

export function CapabilitiesSection({
  serverToolsCount,
  serverPromptsCount,
  serverResourcesCount,
}: Props): React.ReactNode {
  const capabilities = [];
  if (serverToolsCount > 0) {
    capabilities.push('tools');
  }
  if (serverResourcesCount > 0) {
    capabilities.push('resources');
  }
  if (serverPromptsCount > 0) {
    capabilities.push('prompts');
  }

  return (
    <Box>
      <Text bold>能力: </Text>
      <Text color="text">{capabilities.length > 0 ? <Byline>{capabilities}</Byline> : '无'}</Text>
    </Box>
  );
}
