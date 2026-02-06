import { buildIndex, SessionIndex } from './indexer';
import { getLogRoot } from './config';

// Singleton instance
let sessionIndex: SessionIndex | null = null;
let isBuilding = false;

/**
 * Initialize or refresh the session index
 */
export async function initializeSessionIndex(): Promise<SessionIndex> {
  if (sessionIndex && !isBuilding) {
    return sessionIndex;
  }
  
  isBuilding = true;
  try {
    console.log('Building session index...');
    const index = await buildIndex();
    sessionIndex = index;
    console.log(`Session index built: ${index.sessions.size} sessions found`);
    return index;
  } finally {
    isBuilding = false;
  }
}

/**
 * Get the session index (initializes if needed)
 */
export async function getSessionIndex(): Promise<SessionIndex> {
  if (!sessionIndex) {
    return await initializeSessionIndex();
  }
  return sessionIndex;
}

/**
 * Get all sessions from the index
 */
export async function getAllSessions() {
  const index = await getSessionIndex();
  return [...index.sessions.values()];
}

/**
 * Get a single session by chat ID
 */
export async function getSessionById(chatId: string) {
  const index = await getSessionIndex();
  return index.sessions.get(chatId);
}

/**
 * Refresh the session index
 */
export async function refreshSessionIndex() {
  return await initializeSessionIndex();
}
