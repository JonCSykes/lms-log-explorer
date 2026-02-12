import {
  type BuildIndexProgress,
  type SessionIndex,
  buildIndex,
  getSession,
  loadPersistedIndex,
} from './indexer'

let sessionIndex: SessionIndex | null = null
let inFlightBuild: Promise<SessionIndex> | null = null

type IndexingState = 'idle' | 'indexing' | 'ready' | 'error'

export interface IndexingStatus {
  state: IndexingState
  totalFiles: number
  processedFiles: number
  sessionsIndexed: number
  currentFile?: string
  startedAt?: string
  finishedAt?: string
  error?: string
}

interface InitializeSessionOptions {
  forceRefresh?: boolean
}

const indexingStatus: IndexingStatus = {
  state: 'idle',
  totalFiles: 0,
  processedFiles: 0,
  sessionsIndexed: 0,
}

function updateStatusFromProgress(progress: BuildIndexProgress): void {
  indexingStatus.totalFiles = progress.totalFiles
  indexingStatus.processedFiles = progress.processedFiles
  indexingStatus.sessionsIndexed = progress.sessionsIndexed
  indexingStatus.currentFile = progress.currentFile
}

export function getIndexingStatus(): IndexingStatus {
  return { ...indexingStatus }
}

export function getCachedSessionIndex(): SessionIndex {
  if (!sessionIndex) {
    sessionIndex = loadPersistedIndex()
  }

  return sessionIndex
}

export async function initializeSessionIndex(
  options?: InitializeSessionOptions
): Promise<SessionIndex> {
  if (!sessionIndex) {
    sessionIndex = loadPersistedIndex()
  }

  const shouldForceRefresh = options?.forceRefresh === true
  if (!shouldForceRefresh && sessionIndex.sessions.size > 0) {
    return sessionIndex
  }

  if (inFlightBuild) {
    return inFlightBuild
  }

  indexingStatus.state = 'indexing'
  indexingStatus.error = undefined
  indexingStatus.startedAt = new Date().toISOString()
  indexingStatus.finishedAt = undefined
  indexingStatus.processedFiles = 0
  indexingStatus.totalFiles = 0
  indexingStatus.sessionsIndexed = sessionIndex.sessions.size
  indexingStatus.currentFile = undefined

  inFlightBuild = (async () => {
    const index = await buildIndex(undefined, {
      reparseAll: shouldForceRefresh,
      onProgress: (progress) => {
        updateStatusFromProgress(progress)
      },
      onIndexUpdate: (updatedIndex) => {
        sessionIndex = updatedIndex
      },
    })

    sessionIndex = index
    indexingStatus.state = 'ready'
    indexingStatus.finishedAt = new Date().toISOString()
    indexingStatus.currentFile = undefined
    indexingStatus.sessionsIndexed = index.sessions.size
    return index
  })()

  try {
    return await inFlightBuild
  } catch (error) {
    indexingStatus.state = 'error'
    indexingStatus.finishedAt = new Date().toISOString()
    indexingStatus.error =
      error instanceof Error ? error.message : 'Failed to index sessions'
    throw error
  } finally {
    inFlightBuild = null
  }
}

export async function getSessionIndex(): Promise<SessionIndex> {
  if (!sessionIndex) {
    sessionIndex = loadPersistedIndex()
  }

  if (sessionIndex.sessions.size === 0 && !inFlightBuild) {
    void initializeSessionIndex()
  }

  return sessionIndex
}

export async function getAllSessions() {
  const index = await getSessionIndex()
  return [...index.sessions.values()]
}

export async function getSessionById(sessionIdOrChatId: string) {
  const index = await getSessionIndex()
  return getSession(index, sessionIdOrChatId)
}

export async function refreshSessionIndex() {
  return await initializeSessionIndex({ forceRefresh: true })
}
