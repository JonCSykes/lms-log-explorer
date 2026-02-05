export const DEFAULT_LOG_ROOT = '~/.lmstudio/server-logs'

export function getLogRoot(): string {
  const logRoot = process.env.LMS_LOG_ROOT || DEFAULT_LOG_ROOT
  if (logRoot.startsWith('~')) {
    return logRoot.replace('~', process.env.HOME || '')
  }
  return logRoot
}
