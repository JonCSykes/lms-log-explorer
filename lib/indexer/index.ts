import * as crypto from 'node:crypto'
import * as fs from 'node:fs'

import {
  type ClientType,
  type RequestEvent,
  type Session,
  type SessionsListItem,
} from '../../types/types'
import { readLogFileLines } from '../parser/lineReader'
import { type SessionData, buildAsync } from '../parser/sessionBuilder'

import { type LogFile, getAllLogFiles } from './discovery'
import {
  deleteMissingFiles,
  forEachStoredSession,
  listIndexedFiles,
  listSessionGroupNames,
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
  reparseAll?: boolean
}

interface ParsedFileSession {
  session: Session
  sourceOrdinal: number
}

function isDebugEnabled(): boolean {
  return process.env.DEBUG === 'true'
}

function logIndexerDebug(
  message: string,
  data?: Record<string, unknown>
): void {
  if (!isDebugEnabled()) {
    return
  }

  if (!data) {
    console.info(`[indexer] ${message}`)
    return
  }

  console.info(`[indexer] ${message}`, data)
}

export interface SessionGroupSummary {
  sessionGroupId: string
  sessionGroupKey: string
  sessionName?: string
  sessionStartedAt: string
  sessionModel?: string
  sessionClient: ClientType
  sessionRequestCount: number
  sessionTotalInputTokens?: number
  sessionTotalOutputTokens?: number
  sessionAverageTokensPerSecond?: number
  sessionTotalPromptProcessingMs?: number
}

function isOrphanSession(session: Session): boolean {
  return !session.request && session.events.length > 0
}

function recomputeSessionMetricsFromEvents(session: Session): void {
  let promptTokens = session.metrics.promptTokens
  let completionTokens = session.metrics.completionTokens
  let totalTokens = session.metrics.totalTokens
  let latestUsageTs = -1
  let promptProcessingMs = 0
  let promptProcessingFound = false
  let streamLatencyMs = 0
  let streamLatencyFound = false

  for (const event of session.events) {
    const eventWithData = event as unknown as {
      type: string
      ts: string
      data?: unknown
    }

    if (
      eventWithData.type === 'usage' &&
      eventWithData.data &&
      typeof eventWithData.data === 'object'
    ) {
      const usage = eventWithData.data as Record<string, unknown>
      const usageTs = new Date(event.ts).getTime()
      if (usageTs >= latestUsageTs) {
        latestUsageTs = usageTs
        promptTokens =
          typeof usage.prompt_tokens === 'number'
            ? usage.prompt_tokens
            : promptTokens
        completionTokens =
          typeof usage.completion_tokens === 'number'
            ? usage.completion_tokens
            : completionTokens
        totalTokens =
          typeof usage.total_tokens === 'number'
            ? usage.total_tokens
            : totalTokens
      }
    }

    if (
      eventWithData.type === 'prompt_processing' &&
      eventWithData.data &&
      typeof eventWithData.data === 'object'
    ) {
      const value = (eventWithData.data as { elapsedMs?: unknown }).elapsedMs
      if (typeof value === 'number' && Number.isFinite(value)) {
        promptProcessingMs += Math.max(0, value)
        promptProcessingFound = true
      }
    }

    if (
      eventWithData.type === 'stream_chunk' &&
      eventWithData.data &&
      typeof eventWithData.data === 'object'
    ) {
      const value = (eventWithData.data as { elapsedMs?: unknown }).elapsedMs
      if (typeof value === 'number' && Number.isFinite(value)) {
        streamLatencyMs += Math.max(0, value)
        streamLatencyFound = true
      }
    }
  }

  const nextStreamLatency = streamLatencyFound
    ? streamLatencyMs
    : session.metrics.streamLatencyMs
  const nextTokensPerSecond =
    typeof completionTokens === 'number' &&
    typeof nextStreamLatency === 'number' &&
    nextStreamLatency > 0
      ? completionTokens / (nextStreamLatency / 1000)
      : undefined

  session.metrics = {
    promptTokens,
    completionTokens,
    totalTokens,
    promptProcessingMs: promptProcessingFound
      ? promptProcessingMs
      : session.metrics.promptProcessingMs,
    streamLatencyMs: nextStreamLatency,
    tokensPerSecond: nextTokensPerSecond,
  }
}

function mergeOrphanSessionIntoTarget(target: Session, orphan: Session): void {
  const existingEventIds = new Set(target.events.map((event) => event.id))
  for (const event of orphan.events) {
    if (!existingEventIds.has(event.id)) {
      target.events.push(event)
    }
  }
  target.events.sort((left, right) => {
    const leftTs = new Date(left.ts).getTime()
    const rightTs = new Date(right.ts).getTime()
    if (leftTs !== rightTs) {
      return leftTs - rightTs
    }

    return left.id.localeCompare(right.id)
  })

  const existingToolCallKeys = new Set(
    target.toolCalls.map((toolCall) => `${toolCall.toolCallId}:${toolCall.ts}`)
  )
  for (const toolCall of orphan.toolCalls) {
    const toolCallKey = `${toolCall.toolCallId}:${toolCall.ts}`
    if (!existingToolCallKeys.has(toolCallKey)) {
      target.toolCalls.push(toolCall)
    }
  }

  if (!target.chatId && orphan.chatId) {
    target.chatId = orphan.chatId
  }
  if (!target.model && orphan.model) {
    target.model = orphan.model
  }
  if (
    new Date(orphan.firstSeenAt).getTime() <
    new Date(target.firstSeenAt).getTime()
  ) {
    target.firstSeenAt = orphan.firstSeenAt
  }

  recomputeSessionMetricsFromEvents(target)
}

function findMergeTargetForOrphan(
  index: SessionIndex,
  orphan: Session
): Session | undefined {
  const orphanTs = new Date(orphan.firstSeenAt).getTime()
  let bestMatch: Session | undefined
  let bestMatchTs = -1

  for (const candidate of index.sessions.values()) {
    if (!candidate.request) {
      continue
    }

    const candidateTs = new Date(candidate.request.ts).getTime()
    if (candidateTs <= orphanTs && candidateTs >= bestMatchTs) {
      bestMatch = candidate
      bestMatchTs = candidateTs
    }
  }

  return bestMatch
}

function tryAttachOrphanSession(index: SessionIndex, orphan: Session): boolean {
  const target = findMergeTargetForOrphan(index, orphan)
  if (!target) {
    return false
  }

  mergeOrphanSessionIntoTarget(target, orphan)
  addSessionToIndex(index, target)
  return true
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

function buildSessionGroupKey(
  sessionId: string,
  systemMessageChecksum?: string,
  userMessageChecksum?: string
): string {
  if (systemMessageChecksum && userMessageChecksum) {
    return `${systemMessageChecksum}:${userMessageChecksum}`
  }

  return `request:${sessionId}`
}

function buildSessionGroupId(sessionGroupKey: string): string {
  const hash = crypto
    .createHash('sha1')
    .update(sessionGroupKey)
    .digest('hex')
    .slice(0, 12)

  return `session-group-${hash}`
}

function resolveSessionModel(session: Session): string | undefined {
  if (session.model) {
    return session.model
  }

  const requestModel = session.request?.body.model
  return typeof requestModel === 'string' ? requestModel : undefined
}

function normalizeSession(session: Session): Session {
  const sessionGroupKey = session.sessionGroupKey
    ? session.sessionGroupKey
    : buildSessionGroupKey(
        session.sessionId,
        session.systemMessageChecksum,
        session.userMessageChecksum
      )
  const sessionGroupId = session.sessionGroupId
    ? session.sessionGroupId
    : buildSessionGroupId(sessionGroupKey)

  return {
    ...session,
    sessionGroupKey,
    sessionGroupId,
    client: session.client,
    model: resolveSessionModel(session),
  }
}

function parseTimestampMs(value?: string): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = new Date(value).getTime()
  if (!Number.isFinite(parsed)) {
    return undefined
  }

  return parsed
}

function getSessionRequestMetrics(session: Session): {
  requestStartedAt?: string
  requestEndedAt?: string
  requestElapsedMs?: number
  requestPromptProcessingMs?: number
  requestToolCallCount: number
} {
  let earliestEventMs: number | undefined
  let latestEventMs: number | undefined
  let promptProcessingMs = 0
  let hasPromptProcessingMetric = false

  for (const event of session.events) {
    const eventMs = parseTimestampMs(event.ts)
    if (eventMs !== undefined) {
      if (earliestEventMs === undefined || eventMs < earliestEventMs) {
        earliestEventMs = eventMs
      }
      if (latestEventMs === undefined || eventMs > latestEventMs) {
        latestEventMs = eventMs
      }
    }

    const eventWithData = event as {
      type: string
      data?: unknown
    }
    if (
      eventWithData.type === 'prompt_processing' &&
      eventWithData.data &&
      typeof eventWithData.data === 'object'
    ) {
      const value = (eventWithData.data as { elapsedMs?: unknown }).elapsedMs
      if (typeof value === 'number' && Number.isFinite(value)) {
        promptProcessingMs += Math.max(0, value)
        hasPromptProcessingMetric = true
      }
    }
  }

  const requestStartMs =
    parseTimestampMs(session.request?.ts) ??
    earliestEventMs ??
    parseTimestampMs(session.firstSeenAt)
  const requestEndMs = latestEventMs ?? requestStartMs

  const requestStartedAt =
    requestStartMs !== undefined
      ? new Date(requestStartMs).toISOString()
      : undefined
  const requestEndedAt =
    requestEndMs !== undefined
      ? new Date(requestEndMs).toISOString()
      : undefined

  const requestElapsedMs =
    requestStartMs !== undefined && requestEndMs !== undefined
      ? Math.max(0, requestEndMs - requestStartMs)
      : undefined

  return {
    requestStartedAt,
    requestEndedAt,
    requestElapsedMs,
    requestPromptProcessingMs: hasPromptProcessingMetric
      ? promptProcessingMs
      : session.metrics.promptProcessingMs,
    requestToolCallCount: session.toolCalls.length,
  }
}

function toListItem(
  session: Session,
  summary: SessionGroupSummary
): SessionsListItem {
  const displayId = session.chatId || session.sessionId
  const requestMetrics = getSessionRequestMetrics(session)

  return {
    chatId: displayId,
    sessionId: session.sessionId,
    firstSeenAt: session.firstSeenAt,
    requestStartedAt: requestMetrics.requestStartedAt,
    requestEndedAt: requestMetrics.requestEndedAt,
    requestElapsedMs: requestMetrics.requestElapsedMs,
    requestPromptProcessingMs: requestMetrics.requestPromptProcessingMs,
    requestToolCallCount: requestMetrics.requestToolCallCount,
    requestTokensPerSecond: session.metrics.tokensPerSecond,
    model: session.model,
    promptTokens: session.metrics.promptTokens,
    completionTokens: session.metrics.completionTokens,
    streamLatencyMs: session.metrics.streamLatencyMs,
    client: session.client,
    sessionGroupId: session.sessionGroupId,
    sessionGroupKey: session.sessionGroupKey,
    sessionName: summary.sessionName,
    systemMessageChecksum: session.systemMessageChecksum,
    userMessageChecksum: session.userMessageChecksum,
    sessionStartedAt: summary.sessionStartedAt,
    sessionModel: summary.sessionModel,
    sessionClient: summary.sessionClient,
    sessionRequestCount: summary.sessionRequestCount,
    sessionTotalInputTokens: summary.sessionTotalInputTokens,
    sessionTotalOutputTokens: summary.sessionTotalOutputTokens,
    sessionAverageTokensPerSecond: summary.sessionAverageTokensPerSecond,
    sessionTotalPromptProcessingMs: summary.sessionTotalPromptProcessingMs,
  }
}

export function getSessionGroupSummaries(
  index: SessionIndex
): Map<string, SessionGroupSummary> {
  const summaries = new Map<string, SessionGroupSummary>()
  const tpsAccumulator = new Map<string, { sum: number; count: number }>()
  const sessionNames = listSessionGroupNames()

  for (const rawSession of index.sessions.values()) {
    const session = normalizeSession(rawSession)
    const current = summaries.get(session.sessionGroupId)

    const promptTokens = session.metrics.promptTokens
    const completionTokens = session.metrics.completionTokens
    const promptProcessingMs = session.metrics.promptProcessingMs
    const tokensPerSecond = session.metrics.tokensPerSecond

    if (!current) {
      const initialTps =
        typeof tokensPerSecond === 'number' ? tokensPerSecond : undefined
      summaries.set(session.sessionGroupId, {
        sessionGroupId: session.sessionGroupId,
        sessionGroupKey: session.sessionGroupKey,
        sessionName: sessionNames.get(session.sessionGroupId),
        sessionStartedAt: session.firstSeenAt,
        sessionModel: session.model,
        sessionClient: session.client,
        sessionRequestCount: 1,
        sessionTotalInputTokens:
          typeof promptTokens === 'number' ? promptTokens : undefined,
        sessionTotalOutputTokens:
          typeof completionTokens === 'number' ? completionTokens : undefined,
        sessionAverageTokensPerSecond: initialTps,
        sessionTotalPromptProcessingMs:
          typeof promptProcessingMs === 'number'
            ? promptProcessingMs
            : undefined,
      })
      if (typeof tokensPerSecond === 'number') {
        tpsAccumulator.set(session.sessionGroupId, {
          sum: tokensPerSecond,
          count: 1,
        })
      }
      continue
    }

    current.sessionRequestCount += 1
    if (
      new Date(session.firstSeenAt).getTime() <
      new Date(current.sessionStartedAt).getTime()
    ) {
      current.sessionStartedAt = session.firstSeenAt
    }

    if (!current.sessionModel && session.model) {
      current.sessionModel = session.model
    }
    if (current.sessionClient === 'Unknown' && session.client !== 'Unknown') {
      current.sessionClient = session.client
    }

    if (typeof promptTokens === 'number') {
      current.sessionTotalInputTokens =
        (current.sessionTotalInputTokens || 0) + promptTokens
    }

    if (typeof completionTokens === 'number') {
      current.sessionTotalOutputTokens =
        (current.sessionTotalOutputTokens || 0) + completionTokens
    }

    if (typeof promptProcessingMs === 'number') {
      current.sessionTotalPromptProcessingMs =
        (current.sessionTotalPromptProcessingMs || 0) + promptProcessingMs
    }

    if (typeof tokensPerSecond === 'number') {
      const currentAccumulator = tpsAccumulator.get(session.sessionGroupId) || {
        sum: 0,
        count: 0,
      }
      const nextAccumulator = {
        sum: currentAccumulator.sum + tokensPerSecond,
        count: currentAccumulator.count + 1,
      }
      tpsAccumulator.set(session.sessionGroupId, nextAccumulator)
      current.sessionAverageTokensPerSecond =
        nextAccumulator.sum / nextAccumulator.count
    }
  }

  return summaries
}

/**
 * Add a session to the index
 */
export function addSessionToIndex(index: SessionIndex, session: Session): void {
  const normalizedSession = normalizeSession(session)
  const requestMetrics = getSessionRequestMetrics(normalizedSession)
  index.sessions.set(normalizedSession.sessionId, normalizedSession)

  const listItem: SessionsListItem = {
    chatId: normalizedSession.chatId || normalizedSession.sessionId,
    sessionId: normalizedSession.sessionId,
    firstSeenAt: normalizedSession.firstSeenAt,
    requestStartedAt: requestMetrics.requestStartedAt,
    requestEndedAt: requestMetrics.requestEndedAt,
    requestElapsedMs: requestMetrics.requestElapsedMs,
    requestPromptProcessingMs: requestMetrics.requestPromptProcessingMs,
    requestToolCallCount: requestMetrics.requestToolCallCount,
    requestTokensPerSecond: normalizedSession.metrics.tokensPerSecond,
    model: normalizedSession.model,
    promptTokens: normalizedSession.metrics.promptTokens,
    completionTokens: normalizedSession.metrics.completionTokens,
    streamLatencyMs: normalizedSession.metrics.streamLatencyMs,
    client: normalizedSession.client,
    sessionGroupId: normalizedSession.sessionGroupId,
    sessionGroupKey: normalizedSession.sessionGroupKey,
    sessionName: undefined,
    systemMessageChecksum: normalizedSession.systemMessageChecksum,
    userMessageChecksum: normalizedSession.userMessageChecksum,
    sessionStartedAt: normalizedSession.firstSeenAt,
    sessionModel: normalizedSession.model,
    sessionClient: normalizedSession.client,
    sessionRequestCount: 1,
    sessionTotalInputTokens: normalizedSession.metrics.promptTokens,
    sessionTotalOutputTokens: normalizedSession.metrics.completionTokens,
    sessionAverageTokensPerSecond: normalizedSession.metrics.tokensPerSecond,
    sessionTotalPromptProcessingMs:
      normalizedSession.metrics.promptProcessingMs,
  }

  const existingIndex = index.listItems.findIndex(
    (item) => item.sessionId === normalizedSession.sessionId
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
    return normalizeSession(session)
  }

  for (const candidate of index.sessions.values()) {
    if (candidate.chatId === sessionIdOrChatId) {
      return normalizeSession(candidate)
    }
  }

  return undefined
}

export function getSessionGroupSummary(
  index: SessionIndex,
  sessionGroupId: string
): SessionGroupSummary | undefined {
  return getSessionGroupSummaries(index).get(sessionGroupId)
}

/**
 * Get all session list items
 */
export function getSessionList(index: SessionIndex): SessionsListItem[] {
  const summaries = getSessionGroupSummaries(index)

  return [...index.sessions.values()]
    .map((session) => {
      const normalizedSession = normalizeSession(session)
      const summary = summaries.get(normalizedSession.sessionGroupId) || {
        sessionGroupId: normalizedSession.sessionGroupId,
        sessionGroupKey: normalizedSession.sessionGroupKey,
        sessionStartedAt: normalizedSession.firstSeenAt,
        sessionModel: normalizedSession.model,
        sessionClient: normalizedSession.client,
        sessionRequestCount: 1,
      }

      return toListItem(normalizedSession, summary)
    })
    .sort(
      (a, b) =>
        new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime()
    )
}

/**
 * Get session count
 */
export function getSessionCount(index: SessionIndex): number {
  return index.sessions.size
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
    const requestEvent = toRequestEvent(sessionData)
    const sessionModel = extractRequestModel(sessionData) || sessionData.model
    const sessionGroupKey = buildSessionGroupKey(
      sessionId,
      sessionData.systemMessageChecksum,
      sessionData.userMessageChecksum
    )
    const sessionGroupId = buildSessionGroupId(sessionGroupKey)
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
        model: sessionModel,
        client: sessionData.client,
        firstSeenAt: sessionData.firstSeenAt,
        sessionGroupId,
        sessionGroupKey,
        systemMessageChecksum: sessionData.systemMessageChecksum,
        userMessageChecksum: sessionData.userMessageChecksum,
        request: requestEvent,
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
    existing.mtimeMs === file.mtime.getTime() &&
    existing.sizeBytes === file.size
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
  forEachStoredSession((storedSession) => {
    if (isOrphanSession(storedSession.session)) {
      if (tryAttachOrphanSession(index, storedSession.session)) {
        return
      }

      // If no earlier request exists yet, keep current behavior and skip indexing.
      return
    }

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
  })

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
  const buildStartedAt = Date.now()
  const files = logFiles || getAllLogFiles()
  const indexedFiles = listIndexedFiles()
  const latestFilePath = getLatestFilePath(files)
  const { index, sourceSessionIds: sessionsBySourcePath } =
    buildPersistedIndex()

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
  logIndexerDebug('build started', {
    totalFiles: files.length,
    reparseAll: options?.reparseAll === true,
    latestFilePath,
  })

  options?.onProgress?.({
    totalFiles: files.length,
    processedFiles,
    sessionsIndexed: index.sessions.size,
  })

  for (const file of files) {
    const fileStartedAt = Date.now()
    const existing = indexedFiles.get(file.path)
    const shouldAlwaysReparse =
      options?.reparseAll === true || file.path === latestFilePath

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
        const parsedSessions = await parseLogFile(
          file.path,
          (fractionComplete) => {
            options?.onProgress?.({
              totalFiles: files.length,
              processedFiles: processedFilesSnapshot + fractionComplete,
              currentFile: file.path,
              sessionsIndexed: sessionsIndexedSnapshot,
            })
          }
        )

        const previousSessionIds =
          sessionsBySourcePath.get(file.path) || new Set()
        removeSessionsFromIndex(index, previousSessionIds)

        const sessionsToPersist: ParsedFileSession[] = []
        const nextSessionIds = new Set<string>()
        for (const parsedSession of parsedSessions) {
          if (isOrphanSession(parsedSession.session)) {
            if (tryAttachOrphanSession(index, parsedSession.session)) {
              continue
            }
          }

          sessionsToPersist.push(parsedSession)
          nextSessionIds.add(parsedSession.session.sessionId)
          addSessionToIndex(index, parsedSession.session)
        }
        sessionsBySourcePath.set(file.path, nextSessionIds)

        replaceFileSessions({
          sourcePath: file.path,
          checksum,
          mtimeMs: file.mtime.getTime(),
          sizeBytes: file.size,
          sessions: sessionsToPersist.map((parsedSession) => ({
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
        logIndexerDebug('file parsed', {
          filePath: file.path,
          elapsedMs: Date.now() - fileStartedAt,
          sessionsIndexed: index.sessions.size,
        })
      } else {
        logIndexerDebug('file skipped', {
          filePath: file.path,
          elapsedMs: Date.now() - fileStartedAt,
          reason: 'metadata unchanged',
        })
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

  logIndexerDebug('build completed', {
    totalFiles: files.length,
    sessionsIndexed: index.sessions.size,
    elapsedMs: Date.now() - buildStartedAt,
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

function extractRequestModel(sessionData: SessionData): string | undefined {
  const model = sessionData.request?.data.body.model
  return typeof model === 'string' ? model : undefined
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
