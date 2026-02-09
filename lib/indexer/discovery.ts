import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Log directory structure:
 * ~/.lmstudio/server-logs/[yyyy-mm]/[yyyy-mm-dd].#.log
 */

/**
 * Log file entry with metadata
 */
export interface LogFile {
  path: string
  yearMonth: string // YYYY-MM
  filename: string
  mtime: Date
}

/**
 * Get log root directory from environment or default
 */
export function getLogRoot(): string {
  const envRoot = process.env.LMS_LOG_ROOT
  if (envRoot) {
    return expandHome(envRoot)
  }

  const home = process.env.HOME || process.env.USERPROFILE || ''
  return path.join(home, '.lmstudio', 'server-logs')
}

/**
 * Expand ~ to home directory
 */
function expandHome(p: string): string {
  if (p.startsWith('~')) {
    const home = process.env.HOME || process.env.USERPROFILE || ''
    return path.join(home, p.slice(1))
  }
  return p
}

/**
 * List month folders in log directory
 */
export function listMonthFolders(logRoot: string): string[] {
  if (!fs.existsSync(logRoot)) {
    return []
  }

  const entries = fs.readdirSync(logRoot, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse() // Newest month first
}

/**
 * List log files in a month folder
 */
export function listLogFiles(monthFolder: string): LogFile[] {
  if (!fs.existsSync(monthFolder)) {
    return []
  }

  const entries = fs.readdirSync(monthFolder, { withFileTypes: true })

  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.log') &&
        /^20\d{2}-\d{2}-\d{2}/.test(entry.name)
    )
    .map((entry) => {
      const filePath = path.join(monthFolder, entry.name)
      const stats = fs.statSync(filePath)
      return {
        path: filePath,
        yearMonth: entry.name.substring(0, 7),
        filename: entry.name,
        mtime: stats.mtime,
      }
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
}

/**
 * Get all log files from log directory (default: last month)
 */
export function getAllLogFiles(logRoot?: string): LogFile[] {
  const root = logRoot || getLogRoot()
  const monthFolders = listMonthFolders(root)

  if (monthFolders.length === 0) {
    return []
  }

  // Return logs from all months
  const allFiles: LogFile[] = []
  for (const monthFolder of monthFolders) {
    allFiles.push(...listLogFiles(monthFolder))
  }

  return allFiles
}

/**
 * Get recent log files (last N months)
 */
export function getRecentLogFiles(n: number = 1, logRoot?: string): LogFile[] {
  const root = logRoot || getLogRoot()
  const months = listMonthFolders(root)

  // Take last N months
  const selectedMonths = months.slice(0, Math.min(n, months.length))

  const files: LogFile[] = []
  for (const month of selectedMonths) {
    files.push(...listLogFiles(month))
  }

  // Sort by mtime
  return files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
}
