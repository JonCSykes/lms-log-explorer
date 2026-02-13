import * as fs from 'node:fs'
import * as path from 'node:path'

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {}
  }

  const entries = {}
  const raw = fs.readFileSync(filePath, 'utf8')
  const lines = raw.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()
    entries[key] = value.replace(/^['"]|['"]$/g, '')
  }

  return entries
}

function expandHomePath(filePath) {
  if (!filePath || !filePath.startsWith('~')) {
    return filePath
  }

  const home = process.env.HOME || process.env.USERPROFILE || ''
  if (!home) {
    return filePath
  }

  return path.join(home, filePath.slice(1))
}

function getDatabasePath() {
  if (process.env.LMS_INDEX_DB_PATH) {
    return expandHomePath(process.env.LMS_INDEX_DB_PATH)
  }

  const envFromFile = {
    ...parseEnvFile(path.join(process.cwd(), '.env')),
    ...parseEnvFile(path.join(process.cwd(), '.env.local')),
  }
  if (envFromFile.LMS_INDEX_DB_PATH) {
    return expandHomePath(envFromFile.LMS_INDEX_DB_PATH)
  }

  const home = process.env.HOME || process.env.USERPROFILE || ''
  return path.join(home, '.lms-log-explorer', 'index.sqlite')
}

function removeIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return false
  }

  fs.rmSync(filePath, { force: true })
  return true
}

function main() {
  const dbPath = getDatabasePath()
  const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]
  const removedFiles = []

  for (const filePath of files) {
    if (removeIfExists(filePath)) {
      removedFiles.push(filePath)
    }
  }

  if (removedFiles.length === 0) {
    console.log(`No index DB files found at ${dbPath}`)
    return
  }

  console.log('Removed SQLite index files:')
  for (const filePath of removedFiles) {
    console.log(`- ${filePath}`)
  }
}

main()
