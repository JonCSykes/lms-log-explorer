import * as fs from 'node:fs'
import * as path from 'node:path'

import { getAllLogFiles } from '../discovery'
import { buildIndex, getSession, getSessionList } from '../index'

const fixtureSourceRoot = path.join(process.cwd(), 'fixtures', '2024-01')
const fixtureLogRoot = path.join(
  process.cwd(),
  '.tmp',
  'vitest',
  `fixture-log-root-${process.pid}-${Date.now()}`
)
const fixtureMonthRoot = path.join(fixtureLogRoot, '2024-01')
const dbPath = path.join(
  process.cwd(),
  '.tmp',
  'vitest',
  `indexer-${process.pid}-${Date.now()}.sqlite`
)

function cleanupDb(): void {
  try {
    fs.rmSync(dbPath, { force: true })
    fs.rmSync(`${dbPath}-wal`, { force: true })
    fs.rmSync(`${dbPath}-shm`, { force: true })
  } catch {
    // Best effort cleanup.
  }
}

function setupFixtureLogRoot(): void {
  fs.mkdirSync(fixtureMonthRoot, { recursive: true })

  const fixtureFiles = fs
    .readdirSync(fixtureSourceRoot)
    .filter((file) => file.endsWith('.log'))
    .sort()

  fixtureFiles.forEach((fixtureFile, index) => {
    const sourceFilePath = path.join(fixtureSourceRoot, fixtureFile)
    const targetFileName = `2024-01-15.${index + 1}.log`
    const targetFilePath = path.join(fixtureMonthRoot, targetFileName)
    fs.copyFileSync(sourceFilePath, targetFilePath)
  })
}

function cleanupFixtureLogRoot(): void {
  try {
    fs.rmSync(fixtureLogRoot, { force: true, recursive: true })
  } catch {
    // Best effort cleanup.
  }
}

describe('indexer integration', () => {
  beforeAll(() => {
    process.env.LMS_INDEX_DB_PATH = dbPath
    process.env.LMS_LOG_ROOT = fixtureLogRoot
    cleanupDb()
    cleanupFixtureLogRoot()
    setupFixtureLogRoot()
  })

  afterAll(() => {
    cleanupDb()
    cleanupFixtureLogRoot()
  })

  it('builds an index from fixture logs and returns list items', async () => {
    const files = getAllLogFiles(fixtureLogRoot)
    const index = await buildIndex(files, { reparseAll: true })
    const list = getSessionList(index)

    expect(files.length).toBeGreaterThan(0)
    expect(index.sessions.size).toBeGreaterThan(0)
    expect(list.length).toBe(index.sessions.size)

    for (let i = 1; i < list.length; i += 1) {
      const current = list[i]
      const previous = list[i - 1]
      if (!current || !previous) {
        continue
      }

      expect(new Date(previous.firstSeenAt).getTime()).toBeGreaterThanOrEqual(
        new Date(current.firstSeenAt).getTime()
      )
    }
  })

  it('keeps deterministic session IDs across rebuilds for the same files', async () => {
    const files = getAllLogFiles(fixtureLogRoot)

    const firstBuild = await buildIndex(files, { reparseAll: true })
    const firstIds = [...firstBuild.sessions.keys()].sort()

    const secondBuild = await buildIndex(files, { reparseAll: true })
    const secondIds = [...secondBuild.sessions.keys()].sort()

    expect(secondIds).toEqual(firstIds)
  })

  it('resolves sessions by sessionId and chatId', async () => {
    const files = getAllLogFiles(fixtureLogRoot)
    const index = await buildIndex(files, { reparseAll: true })

    const withChatId = [...index.sessions.values()].find(
      (session) =>
        typeof session.chatId === 'string' && session.chatId.length > 0
    )

    expect(withChatId).toBeDefined()
    if (!withChatId?.chatId) {
      return
    }

    expect(getSession(index, withChatId.sessionId)?.sessionId).toBe(
      withChatId.sessionId
    )
    expect(getSession(index, withChatId.chatId)?.sessionId).toBe(
      withChatId.sessionId
    )
  })
})
