import { type Session, type SessionsListItem } from '../../types/types'
import { readLogFileLines } from '../parser/lineReader'
import { SessionBuilder } from '../parser/sessionBuilder'

import { type LogFile, getAllLogFiles } from './discovery'

export type { Session, SessionsListItem }

/**
 * In-memory session index
 */
export interface SessionIndex {
  sessions: Map<string, Session>
  listItems: SessionsListItem[]
  indexedAt: Date
}

/**
 * Add a session to the index
 */
export function addSessionToIndex(index: SessionIndex, session: Session): void {
  index.sessions.set(session.chatId, session)

  const listItem: SessionsListItem = {
    chatId: session.chatId,
    firstSeenAt: session.firstSeenAt,
    model: session.model,
    promptTokens: session.metrics.promptTokens,
    completionTokens: session.metrics.completionTokens,
    streamLatencyMs: session.metrics.streamLatencyMs,
  }

  const existingIndex = index.listItems.findIndex(
    (item) => item.chatId === session.chatId
  )

  if (existingIndex >= 0) {
    index.listItems[existingIndex] = listItem
  } else {
    index.listItems.push(listItem)
  }
}

/**
 * Get session by chat ID
 */
export function getSession(
  index: SessionIndex,
  chatId: string
): Session | undefined {
  return index.sessions.get(chatId)
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

/**
 * Parse a single log file and extract session data
 */
async function parseLogFile(filePath: string): Promise<Session[]> {
  const lines = await readLogFileLines(filePath)

  if (lines.length === 0) return []

  const builder = new SessionBuilder()

  for (const line of lines) {
    builder.addLine(line)
  }

  const sessionData = builder.build()
  if (!sessionData) return []

  // Convert to type Session
  const toolCalls = sessionData.toolCalls.map((tc) => ({
    type: 'tool_call' as const,
    id: tc.id,
    ts: tc.requestedAt || sessionData.firstSeenAt,
    toolCallId: tc.id,
    name: tc.name,
    argumentsText: tc.argumentsText,
    argumentsJson: tc.argumentsJson,
  }))

  const session: Session = {
    chatId: sessionData.chatId,
    model: sessionData.model,
    firstSeenAt: sessionData.firstSeenAt,
    request: undefined, // We'll populate this later if needed
    events: sessionData.events,
    toolCalls,
    metrics: sessionData.metrics,
  }

  return [session]
}

/**
 * Build index from log files
 */
export async function buildIndex(logFiles?: LogFile[]): Promise<SessionIndex> {
  const files = logFiles || getAllLogFiles()
  const index = createEmptyIndex()

  for (const file of files) {
    try {
      const sessions = await parseLogFile(file.path)

      for (const session of sessions) {
        addSessionToIndex(index, session)
      }

      console.log(`Indexed ${file.path}: ${sessions.length} session(s)`)
    } catch (e) {
      console.error(`Failed to index file: ${file.path}`, e)
    }
  }

  return index
}

/**
 * Refresh indexed sessions
 */
export async function refreshIndex(
  logFiles?: LogFile[]
): Promise<SessionIndex> {
  return buildIndex(logFiles)
}
