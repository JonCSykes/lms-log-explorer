import * as fs from 'node:fs'
import * as path from 'node:path'

import type { Session } from '../../../types/types'
import {
  forEachStoredSession,
  loadStoredSessions,
  replaceFileSessions,
} from '../sqliteStore'

const dbPath = path.join(
  process.cwd(),
  '.tmp',
  'vitest',
  `sqlite-store-${process.pid}-${Date.now()}.sqlite`
)

function cleanupDb(): void {
  try {
    fs.rmSync(dbPath, { force: true })
    fs.rmSync(`${dbPath}-wal`, { force: true })
    fs.rmSync(`${dbPath}-shm`, { force: true })
  } catch {
    // Best-effort cleanup.
  }
}

function buildSession(sessionId: string, firstSeenAt: string): Session {
  return {
    sessionId,
    firstSeenAt,
    sessionGroupKey: `request:${sessionId}`,
    sessionGroupId: `session-group-${sessionId}`,
    client: 'Unknown',
    events: [],
    toolCalls: [],
    metrics: {},
  }
}

describe('sqliteStore', () => {
  const originalDbPath = process.env.LMS_INDEX_DB_PATH

  beforeAll(() => {
    process.env.LMS_INDEX_DB_PATH = dbPath
    cleanupDb()
  })

  afterAll(() => {
    cleanupDb()
    if (originalDbPath === undefined) {
      delete process.env.LMS_INDEX_DB_PATH
    } else {
      process.env.LMS_INDEX_DB_PATH = originalDbPath
    }
  })

  it('iterates stored sessions in ascending first-seen order', () => {
    replaceFileSessions({
      sourcePath: '/tmp/a.log',
      checksum: 'abc',
      mtimeMs: Date.now(),
      sizeBytes: 10,
      sessions: [
        {
          sourcePath: '/tmp/a.log',
          sourceOrdinal: 1,
          session: buildSession('session-2', '2026-02-13 10:00:00'),
        },
        {
          sourcePath: '/tmp/a.log',
          sourceOrdinal: 0,
          session: buildSession('session-1', '2026-02-13 09:00:00'),
        },
      ],
    })

    const ids: string[] = []
    forEachStoredSession((record) => {
      ids.push(record.session.sessionId)
    })

    expect(ids).toEqual(['session-1', 'session-2'])
  })

  it('returns the same records through iterator and array APIs', () => {
    const iteratedIds: string[] = []
    forEachStoredSession((record) => {
      iteratedIds.push(record.session.sessionId)
    })

    const loadedIds = loadStoredSessions().map((record) => record.session.sessionId)
    expect(iteratedIds).toEqual(loadedIds)
  })
})
