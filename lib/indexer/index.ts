import * as fs from 'fs';
import { LogFile, getAllLogFiles } from './discovery';
import { Session, SessionsListItem } from '../../types/types';

/**
 * In-memory session index
 */
export interface SessionIndex {
  sessions: Map<string, Session>;
  listItems: SessionsListItem[];
  indexedAt: Date;
}

/**
 * Add a session to the index
 */
export function addSessionToIndex(
  index: SessionIndex,
  session: Session,
): void {
  index.sessions.set(session.chatId, session);
  
  const listItem: SessionsListItem = {
    chatId: session.chatId,
    firstSeenAt: session.firstSeenAt,
    model: session.model,
    promptTokens: session.metrics.promptTokens,
    completionTokens: session.metrics.completionTokens,
    streamLatencyMs: session.metrics.streamLatencyMs,
  };
  
  const existingIndex = index.listItems.findIndex(
    (item) => item.chatId === session.chatId,
  );
  
  if (existingIndex >= 0) {
    index.listItems[existingIndex] = listItem;
  } else {
    index.listItems.push(listItem);
  }
}

/**
 * Get session by chat ID
 */
export function getSession(index: SessionIndex, chatId: string): Session | undefined {
  return index.sessions.get(chatId);
}

/**
 * Get all session list items
 */
export function getSessionList(index: SessionIndex): SessionsListItem[] {
  return [...index.listItems].sort(
    (a, b) => new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime(),
  );
}

/**
 * Get session count
 */
export function getSessionCount(index: SessionIndex): number {
  return index.listItems.length;
}

/**
 * Create empty session index
 */
export function createEmptyIndex(): SessionIndex {
  return {
    sessions: new Map<string, Session>(),
    listItems: [],
    indexedAt: new Date(),
  };
}

/**
 * Build index from log files
 */
export function buildIndex(logFiles?: LogFile[]): SessionIndex {
  const files = logFiles || getAllLogFiles();
  const index = createEmptyIndex();
  
  for (const file of files) {
    try {
      // TODO: Actually parse and build sessions
    } catch (e) {
      console.error(`Failed to index file: ${file.path}`, e);
    }
  }
  
  return index;
}

/**
 * Refresh indexed sessions
 */
export function refreshIndex(logFiles?: LogFile[]): SessionIndex {
  return buildIndex(logFiles);
}
