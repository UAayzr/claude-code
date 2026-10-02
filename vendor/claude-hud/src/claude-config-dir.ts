import * as path from 'node:path';

export function expandHomeDirPrefix(inputPath: string, homeDir: string): string {
  if (inputPath === '~') {
    return homeDir;
  }
  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return path.join(homeDir, inputPath.slice(2));
  }
  return inputPath;
}

export function getClaudeConfigDir(homeDir: string): string {
  // UAayzr: data lives exclusively under UAayzr-named dirs. The legacy
  // CLAUDE_CONFIG_DIR is deliberately NOT honored (matches the UAayzr CLI).
  const envConfigDir = process.env.UAAYZR_CONFIG_DIR?.trim();
  if (!envConfigDir) {
    return path.join(homeDir, '.uaayzr');
  }
  return path.resolve(expandHomeDirPrefix(envConfigDir, homeDir));
}

// UAayzr keeps .uaayzr.json inside UAAYZR_CONFIG_DIR when it is set, otherwise in the home directory.
export function getClaudeConfigJsonPath(homeDir: string): string {
  const envConfigDir = process.env.UAAYZR_CONFIG_DIR?.trim();
  if (!envConfigDir) {
    return path.join(homeDir, '.uaayzr.json');
  }
  return path.join(getClaudeConfigDir(homeDir), '.uaayzr.json');
}

export function getHudPluginDir(homeDir: string): string {
  return path.join(getClaudeConfigDir(homeDir), 'plugins', 'claude-hud');
}
