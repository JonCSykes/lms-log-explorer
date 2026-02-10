import * as crypto from 'node:crypto'
import * as fs from 'node:fs'

import {
  type RequestEvent,
  type Session,
  type SessionsListItem,
} from '../../types/types'
import { readLogFileLines } from '../parser/lineReader'
import { type SessionData, buildAsync } from '../parser/sessionBuilder'

import { type LogFile, getAllLogFiles } from './discovery'
import {
  deleteMissingFiles,
  listIndexedFiles,
  loadStoredSessions,
  replaceFileSessions,
  upsertIndexedFile,
} from './sqliteStore'

export * from './cache'
export * from './sqliteStore'

// Global session index instance
let globalIndex: SessionIndex | null = null

export type { Session, SessionsListItem }

/**
 * In-memory session index
 */
export interface SessionIndex {
  sessions: Map<string, Session>
  listItems: SessionsListItem[]
  indexedAt: Date
}

export interface BuildIndexProgress {
  totalFiles: number
  processedFiles: number
  currentFile?: string
  sessionsIndexed: number
}

interface BuildIndexOptions {
  onProgress?: (progress: BuildIndexProgress) => void
  onIndexUpdate?: (index: SessionIndex) => void
}

interface ParsedFileSession {
  session: Session
  sourceOrdinal: number
}

/**
 * Get or create the global session index
 */
export function getIndex(): SessionIndex {
  if (!globalIndex) {
    globalIndex = createEmptyIndex()
  }

  return globalIndex
}

/**
 * Force refresh the index (for manual reindexing)
 */
export function forceRefreshIndex(): SessionIndex {
  globalIndex = null
  return getIndex()
}

/**
 * Add a session to the index
 */
export function addSessionToIndex(index: SessionIndex, session: Session): void {
  index.sessions.set(session.sessionId, session)

  const displayId = session.chatId || session.sessionId
  const listItem: SessionsListItem = {
    chatId: displayId,
    sessionId: session.sessionId,
    firstSeenAt: session.firstSeenAt,
    model: session.model,
    promptTokens: session.metrics.promptTokens,
    completionTokens: session.metrics.completionTokens,
    streamLatencyMs: session.metrics.streamLatencyMs,
  }

  const existingIndex = index.listItems.findIndex(
    (item) => item.sessionId === session.sessionId
  )

  if (existingIndex >= 0) {
    index.listItems[existingIndex] = listItem
  } else {
    index.listItems.push(listItem)
  }
}

/**
 * Get session by session ID or chat ID
 */
export function getSession(
  index: SessionIndex,
  sessionIdOrChatId: string
): Session | undefined {
  const session = index.sessions.get(sessionIdOrChatId)
  if (session) {
    return session
  }

  for (const candidate of index.sessions.values()) {
    if (candidate.chatId === sessionIdOrChatId) {
      return candidate
    }
  }

  return undefined
}

/**
 * Get all session list items
 */
export function getSessionList(index: SessionIndex): SessionsListItem[] {
  return [...index.listItems].sort(
    (a, b) =>
      new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime()
  )
}

/**
 * Get session count
 */
export function getSessionCount(index: SessionIndex): number {
  return index.listItems.length
}

/**
 * Create empty session index
 */
export function createEmptyIndex(): SessionIndex {
  return {
    sessions: new Map<string, Session>(),
    listItems: [],
    indexedAt: new Date(),
  }
}

function buildSessionId(sourcePath: string, sourceOrdinal: number): string {
  const sourceHash = crypto
    .createHash('sha1')
    .update(sourcePath)
    .digest('hex')
    .slice(0, 12)
  return `session-${sourceHash}-${String(sourceOrdinal + 1).padStart(4, '0')}`
}

async function parseLogFile(
  filePath: string,
  onProgress?: (fractionComplete: number) => void
): Promise<ParsedFileSession[]> {
  const lines = await readLogFileLines(filePath)
  if (lines.length === 0) {
    return []
  }

  const sessionDataList = await buildAsync(lines, { onProgress })
  if (sessionDataList.length === 0) {
    return []
  }

  return sessionDataList.map((sessionData, sourceOrdinal) => {
    const sessionId = buildSessionId(filePath, sourceOrdinal)
    const toolCalls = sessionData.toolCalls.map((toolCall) => ({
      id: toolCall.id,
      type: 'tool_call' as const,
      ts: toolCall.requestedAt || sessionData.firstSeenAt,
      toolCallId: toolCall.id,
      name: toolCall.name,
      argumentsText: toolCall.argumentsText,
      argumentsJson: toolCall.argumentsJson,
    }))

    return {
      sourceOrdinal,
      session: {
        sessionId,
        chatId: sessionData.chatId,
        model: sessionData.model,
        firstSeenAt: sessionData.firstSeenAt,
        request: toRequestEvent(sessionData),
        events: sessionData.events,
        toolCalls,
        metrics: sessionData.metrics,
      },
    }
  })
}

async function computeFileChecksum(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256')
  const stream = fs.createReadStream(filePath)

  for await (const chunk of stream) {
    hash.update(chunk as Buffer)
  }

  return hash.digest('hex')
}

function isFileMetadataMatch(
  file: LogFile,
  existing: { mtimeMs: number; sizeBytes: number } | undefined
): boolean {
  if (!existing) {
    return false
  }

  return (
    existing.mtimeMs === file.mtime.getTime() && existing.sizeBytes === file.size
  )
}

function removeSessionsFromIndex(
  index: SessionIndex,
  sessionIds: Set<string>
): void {
  if (sessionIds.size === 0) {
    return
  }

  for (const sessionId of sessionIds) {
    index.sessions.delete(sessionId)
  }

  index.listItems = index.listItems.filter(
    (item) => !sessionIds.has(item.sessionId)
  )
}

function buildPersistedIndex(): {
  index: SessionIndex
  sourceSessionIds: Map<string, Set<string>>
} {
  const index = createEmptyIndex()
  const sourceSessionIds = new Map<string, Set<string>>()
  const storedSessions = loadStoredSessions()

  for (const storedSession of storedSessions) {
    addSessionToIndex(index, storedSession.session)

    const existing = sourceSessionIds.get(storedSession.sourcePath)
    if (existing) {
      existing.add(storedSession.session.sessionId)
    } else {
      sourceSessionIds.set(
        storedSession.sourcePath,
        new Set([storedSession.session.sessionId])
      )
    }
  }

  return {
    index,
    sourceSessionIds,
  }
}

export function loadPersistedIndex(): SessionIndex {
  return buildPersistedIndex().index
}

function getLatestFilePath(files: LogFile[]): string | undefined {
  const firstFile = files[0]
  if (!firstFile) {
    return undefined
  }

  let latestFile = firstFile
  for (const file of files) {
    if (file.mtime.getTime() > latestFile.mtime.getTime()) {
      latestFile = file
    }
  }

  return latestFile.path
}

/**
 * Build index from log files.
 *
 * Behavior:
 * - Loads persisted sessions from SQLite first.
 * - Parses only new/changed files.
 * - Always reparses the latest log file to catch append-only writes.
 */
export async function buildIndex(
  logFiles?: LogFile[],
  options?: BuildIndexOptions
): Promise<SessionIndex> {
  const files = logFiles || getAllLogFiles()
  const indexedFiles = listIndexedFiles()
  const latestFilePath = getLatestFilePath(files)
  const {
    index,
    sourceSessionIds: sessionsBySourcePath,
  } = buildPersistedIndex()

  const currentPaths = new Set(files.map((file) => file.path))
  const removedPaths = deleteMissingFiles(currentPaths)
  for (const removedPath of removedPaths) {
    const removedSessionIds = sessionsBySourcePath.get(removedPath)
    if (removedSessionIds) {
      removeSessionsFromIndex(index, removedSessionIds)
      sessionsBySourcePath.delete(removedPath)
    }
  }
  if (removedPaths.length > 0) {
    options?.onIndexUpdate?.(index)
  }

  let processedFiles = 0
  options?.onProgress?.({
    totalFiles: files.length,
    processedFiles,
    sessionsIndexed: index.sessions.size,
  })

  for (const file of files) {
    const existing = indexedFiles.get(file.path)
    const shouldAlwaysReparse = file.path === latestFilePath

    options?.onProgress?.({
      totalFiles: files.length,
      processedFiles,
      currentFile: file.path,
      sessionsIndexed: index.sessions.size,
    })

    try {
      let checksum = existing?.checksum ?? ''
      let shouldParse = shouldAlwaysReparse || !existing

      if (!shouldParse && existing && !isFileMetadataMatch(file, existing)) {
        checksum = await computeFileChecksum(file.path)
        shouldParse = checksum !== existing.checksum

        if (!shouldParse) {
          const nowIso = new Date().toISOString()
          upsertIndexedFile({
            path: file.path,
            checksum,
            mtimeMs: file.mtime.getTime(),
            sizeBytes: file.size,
            lastIndexedAt: nowIso,
          })
          indexedFiles.set(file.path, {
            path: file.path,
            checksum,
            mtimeMs: file.mtime.getTime(),
            sizeBytes: file.size,
            lastIndexedAt: nowIso,
          })
        }
      }

      if (shouldParse) {
        if (!checksum || shouldAlwaysReparse) {
          checksum = await computeFileChecksum(file.path)
        }

        const processedFilesSnapshot = processedFiles
        const sessionsIndexedSnapshot = index.sessions.size
        const parsedSessions = await parseLogFile(file.path, (fractionComplete) => {
          options?.onProgress?.({
            totalFiles: files.length,
            processedFiles: processedFilesSnapshot + fractionComplete,
            currentFile: file.path,
            sessionsIndexed: sessionsIndexedSnapshot,
          })
        })

        const previousSessionIds = sessionsBySourcePath.get(file.path) || new Set()
        removeSessionsFromIndex(index, previousSessionIds)

        const nextSessionIds = new Set<string>()
        for (const parsedSession of parsedSessions) {
          nextSessionIds.add(parsedSession.session.sessionId)
          addSessionToIndex(index, parsedSession.session)
        }
        sessionsBySourcePath.set(file.path, nextSessionIds)

        replaceFileSessions({
          sourcePath: file.path,
          checksum,
          mtimeMs: file.mtime.getTime(),
          sizeBytes: file.size,
          sessions: parsedSessions.map((parsedSession) => ({
            session: parsedSession.session,
            sourcePath: file.path,
            sourceOrdinal: parsedSession.sourceOrdinal,
          })),
        })

        const nowIso = new Date().toISOString()
        indexedFiles.set(file.path, {
          path: file.path,
          checksum,
          mtimeMs: file.mtime.getTime(),
          sizeBytes: file.size,
          lastIndexedAt: nowIso,
        })

        options?.onIndexUpdate?.(index)
      }
    } catch (error) {
      console.error(`Failed to index file: ${file.path}`, error)
    }

    processedFiles += 1
    options?.onProgress?.({
      totalFiles: files.length,
      processedFiles,
      currentFile: file.path,
      sessionsIndexed: index.sessions.size,
    })
  }

  index.indexedAt = new Date()
  globalIndex = index
  options?.onIndexUpdate?.(index)
  options?.onProgress?.({
    totalFiles: files.length,
    processedFiles,
    sessionsIndexed: index.sessions.size,
  })

  return index
}

/**
 * Refresh indexed sessions
 */
export async function refreshIndex(
  logFiles?: LogFile[]
): Promise<SessionIndex> {
  return await buildIndex(logFiles)
}

function toRequestEvent(sessionData: SessionData): RequestEvent | undefined {
  if (!sessionData.request) {
    return undefined
  }

  return {
    id: `request-${sessionData.request.ts}`,
    type: 'request',
    ts: sessionData.request.ts,
    endpoint: sessionData.request.data.endpoint,
    method: sessionData.request.data.method,
    body: sessionData.request.data.body as unknown as RequestEvent['body'],
  }
}
