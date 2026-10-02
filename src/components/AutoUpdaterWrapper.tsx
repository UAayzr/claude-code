import * as React from 'react';
import type { AutoUpdaterResult } from '../utils/autoUpdater.js';

type Props = {
  isUpdating: boolean;
  onChangeIsUpdating: (isUpdating: boolean) => void;
  onAutoUpdaterResult: (autoUpdaterResult: AutoUpdaterResult) => void;
  autoUpdaterResult: AutoUpdaterResult | null;
  showSuccessMessage: boolean;
  verbose: boolean;
};

export function AutoUpdaterWrapper({
  isUpdating,
  onChangeIsUpdating,
  onAutoUpdaterResult,
  autoUpdaterResult,
  showSuccessMessage,
  verbose,
}: Props): React.ReactNode {
  // Automatic updates are disabled for this distribution. The upstream
  // updater can inspect or modify the official Claude installation. Users
  // can update safely with `npm install -g uaayzr`.
  void isUpdating;
  void onChangeIsUpdating;
  void onAutoUpdaterResult;
  void autoUpdaterResult;
  void showSuccessMessage;
  void verbose;
  return null;
}
