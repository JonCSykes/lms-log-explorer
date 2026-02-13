import * as fs from 'node:fs'
import * as path from 'node:path'

const fixturesPath = path.join(process.cwd(), 'fixtures')
const tempDir = path.join(process.cwd(), '.tmp', 'vitest')
const dbPath = path.join(tempDir, `index-${process.pid}.sqlite`)

function removeIfExists(filePath: string): void {
  try {
    fs.rmSync(filePath, { force: true })
  } catch {
    // Best effort cleanup for test databases.
  }
}

fs.mkdirSync(tempDir, { recursive: true })
removeIfExists(dbPath)
removeIfExists(`${dbPath}-wal`)
removeIfExists(`${dbPath}-shm`)

process.env.LMS_LOG_ROOT = fixturesPath
process.env.LMS_INDEX_DB_PATH = dbPath
