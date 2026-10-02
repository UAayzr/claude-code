import { join } from 'node:path'
import { UAAYZR_PROJECT_CONFIG_DIR } from '../constants/identity.js'

/** Return UAayzr's project-local settings directory. */
export function getProjectConfigDir(root: string): string {
  return join(root, UAAYZR_PROJECT_CONFIG_DIR)
}

export function getProjectConfigPath(root: string, ...parts: string[]): string {
  return join(getProjectConfigDir(root), ...parts)
}
