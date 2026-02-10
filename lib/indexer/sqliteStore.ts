import * as fs from 'node:fs'
import * as path from 'node:path'

import Database from 'better-sqlite3'

import { type Session } from '../../types/types'

interface SessionRow {
  session_id: string
  chat_id: string | null
  first_seen_at: string
  model: string | null
  request_json: string | null
  events_json: string
  tool_calls_json: string
  metrics_json: string
  source_path: string
  source_ordinal: number
}

interface IndexedFileRow {
  path: string
  checksum: string
  mtime_ms: number
  size_bytes: number
  last_indexed_at: string
}

export interface StoredSessionRecord {
  session: Session
  sourcePath: string
  sourceOrdinal: number
}

export interface IndexedFileRecord {
  path: string
  checksum: string
  mtimeMs: number
  sizeBytes: number
  lastIndexedAt: string
}

interface ReplaceFileSessionsInput {
  sourcePath: string
  checksum: string
  mtimeMs: number
  sizeBytes: number
  sessions: StoredSessionRecord[]
}

interface DbGlobal {
  db?: Database.Database
  dbPath?: string
}

const DATABASE_SCHEMA_VERSION = 1
const globalDb = globalThis as unknown as DbGlobal

function expandHomePath(filePath: string): string {
  if (!filePath.startsWith('~')) {
    return filePath
  }

  const home = process.env.HOME || process.env.USERPROFILE || ''
  return path.join(home, filePath.slice(1))
}

function getDatabasePath(): string {
  if (process.env.LMS_INDEX_DB_PATH) {
    return expandHomePath(process.env.LMS_INDEX_DB_PATH)
  }

  const home = process.env.HOME || process.env.USERPROFILE || ''
  return path.join(home, '.lms-log-explorer', 'index.sqlite')
}

function ensureSchema(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS indexed_files (
      path TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      mtime_ms INTEGER NOT NULL,
      size_bytes INTEGER NOT NULL,
      last_indexed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      chat_id TEXT,
      first_seen_at TEXT NOT NULL,
      model TEXT,
      request_json TEXT,
      events_json TEXT NOT NULL,
      tool_calls_json TEXT NOT NULL,
      metrics_json TEXT NOT NULL,
      source_path TEXT NOT NULL,
      source_ordinal INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_chat_id ON sessions(chat_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_first_seen_at ON sessions(first_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_source_path ON sessions(source_path);
  `)

  db.prepare(
    `
      INSERT INTO metadata (key, value)
      VALUES ('schema_version', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `
  ).run(String(DATABASE_SCHEMA_VERSION))
}

function getDatabase(): Database.Database {
  const dbPath = getDatabasePath()
  if (globalDb.db && globalDb.dbPath === dbPath) {
    return globalDb.db
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  ensureSchema(db)

  globalDb.db = db
  globalDb.dbPath = dbPath
  return db
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function getStorePath(): string {
  return getDatabasePath()
}

export function listIndexedFiles(): Map<string, IndexedFileRecord> {
  const db = getDatabase()
  const rows = db
    .prepare<[], IndexedFileRow>('SELECT * FROM indexed_files')
    .all()

  const map = new Map<string, IndexedFileRecord>()
  for (const row of rows) {
    map.set(row.path, {
      path: row.path,
      checksum: row.checksum,
      mtimeMs: row.mtime_ms,
      sizeBytes: row.size_bytes,
      lastIndexedAt: row.last_indexed_at,
    })
  }

  return map
}

export function loadStoredSessions(): StoredSessionRecord[] {
  const db = getDatabase()
  const rows = db
    .prepare<[], SessionRow>(
      `
        SELECT
          session_id,
          chat_id,
          first_seen_at,
          model,
          request_json,
          events_json,
          tool_calls_json,
          metrics_json,
          source_path,
          source_ordinal
        FROM sessions
        ORDER BY first_seen_at DESC
      `
    )
    .all()

  return rows.map((row) => {
    const requestValue = parseJson<Session['request'] | null>(
      row.request_json,
      null
    )

    return {
      sourcePath: row.source_path,
      sourceOrdinal: row.source_ordinal,
      session: {
        sessionId: row.session_id,
        chatId: row.chat_id || undefined,
        firstSeenAt: row.first_seen_at,
        model: row.model || undefined,
        request: requestValue ?? undefined,
        events: parseJson(row.events_json, []),
        toolCalls: parseJson(row.tool_calls_json, []),
        metrics: parseJson(row.metrics_json, {}),
      },
    }
  })
}

export function replaceFileSessions(input: ReplaceFileSessionsInput): void {
  const db = getDatabase()
  const nowIso = new Date().toISOString()

  const deleteSessionsStmt = db.prepare(
    'DELETE FROM sessions WHERE source_path = ?'
  )
  const insertSessionStmt = db.prepare(`
    INSERT INTO sessions (
      session_id,
      chat_id,
      first_seen_at,
      model,
      request_json,
      events_json,
      tool_calls_json,
      metrics_json,
      source_path,
      source_ordinal,
      updated_at
    )
    VALUES (
      @session_id,
      @chat_id,
      @first_seen_at,
      @model,
      @request_json,
      @events_json,
      @tool_calls_json,
      @metrics_json,
      @source_path,
      @source_ordinal,
      @updated_at
    )
  `)
  const upsertFileStmt = db.prepare(`
    INSERT INTO indexed_files (
      path,
      checksum,
      mtime_ms,
      size_bytes,
      last_indexed_at
    )
    VALUES (
      @path,
      @checksum,
      @mtime_ms,
      @size_bytes,
      @last_indexed_at
    )
    ON CONFLICT(path) DO UPDATE SET
      checksum = excluded.checksum,
      mtime_ms = excluded.mtime_ms,
      size_bytes = excluded.size_bytes,
      last_indexed_at = excluded.last_indexed_at
  `)

  const transaction = db.transaction((txInput: ReplaceFileSessionsInput) => {
    deleteSessionsStmt.run(txInput.sourcePath)

    for (const record of txInput.sessions) {
      const { session } = record
      insertSessionStmt.run({
        session_id: session.sessionId,
        chat_id: session.chatId ?? null,
        first_seen_at: session.firstSeenAt,
        model: session.model ?? null,
        request_json: session.request ? JSON.stringify(session.request) : null,
        events_json: JSON.stringify(session.events),
        tool_calls_json: JSON.stringify(session.toolCalls),
        metrics_json: JSON.stringify(session.metrics),
        source_path: txInput.sourcePath,
        source_ordinal: record.sourceOrdinal,
        updated_at: nowIso,
      })
    }

    upsertFileStmt.run({
      path: txInput.sourcePath,
      checksum: txInput.checksum,
      mtime_ms: txInput.mtimeMs,
      size_bytes: txInput.sizeBytes,
      last_indexed_at: nowIso,
    })
  })

  transaction(input)
}

export function upsertIndexedFile(record: IndexedFileRecord): void {
  const db = getDatabase()

  db.prepare(
    `
      INSERT INTO indexed_files (
        path,
        checksum,
        mtime_ms,
        size_bytes,
        last_indexed_at
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        checksum = excluded.checksum,
        mtime_ms = excluded.mtime_ms,
        size_bytes = excluded.size_bytes,
        last_indexed_at = excluded.last_indexed_at
    `
  ).run(
    record.path,
    record.checksum,
    record.mtimeMs,
    record.sizeBytes,
    record.lastIndexedAt
  )
}

export function deleteMissingFiles(existingPaths: Set<string>): string[] {
  const db = getDatabase()
  const indexedRows = db
    .prepare<[], { path: string }>('SELECT path FROM indexed_files')
    .all()

  const deleteSessionsStmt = db.prepare(
    'DELETE FROM sessions WHERE source_path = ?'
  )
  const deleteFileStmt = db.prepare('DELETE FROM indexed_files WHERE path = ?')

  const removedPaths = indexedRows
    .map((row) => row.path)
    .filter((pathValue) => !existingPaths.has(pathValue))

  const transaction = db.transaction((pathsToRemove: string[]) => {
    for (const pathValue of pathsToRemove) {
      deleteSessionsStmt.run(pathValue)
      deleteFileStmt.run(pathValue)
    }
  })

  transaction(removedPaths)
  return removedPaths
}
