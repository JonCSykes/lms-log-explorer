'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { type AiSessionRenamerSettingsResponse } from '@/lib/ai/settings'
import { type ClientType } from '@/types'

interface Session {
  sessionId: string
  chatId?: string
  firstSeenAt: string
  requestStartedAt?: string
  requestEndedAt?: string
  requestElapsedMs?: number
  requestPromptProcessingMs?: number
  requestToolCallCount?: number
  requestTokensPerSecond?: number
  model?: string
  promptTokens?: number
  completionTokens?: number
  streamLatencyMs?: number
  client: ClientType
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

interface ApiSession {
  sessionId: string
  chatId?: string
  firstSeenAt: string
  requestStartedAt?: string
  requestEndedAt?: string
  requestElapsedMs?: number
  requestPromptProcessingMs?: number
  requestToolCallCount?: number
  requestTokensPerSecond?: number
  model?: string
  promptTokens?: number
  completionTokens?: number
  streamLatencyMs?: number
  client: ClientType
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

type IndexingState = 'idle' | 'indexing' | 'ready' | 'error'

export interface IndexStatus {
  state: IndexingState
  totalFiles: number
  processedFiles: number
  sessionsIndexed: number
  currentFile?: string
  startedAt?: string
  finishedAt?: string
  error?: string
}

interface SessionsResponse {
  sessions: ApiSession[]
  totalCount?: number
  status?: IndexStatus
}

interface IndexStatusResponse {
  status?: IndexStatus
}

const POLL_MS = 1000
const SESSIONS_PAGE_SIZE = 500
const RENAMER_LIVE_REFRESH_MS = 1200

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<IndexStatus | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const renamerRunKeyRef = useRef<string | null>(null)

  const fetchSessions = useCallback(async () => {
    let offset = 0
    let totalCount = Number.POSITIVE_INFINITY
    let latestStatus: IndexStatus | undefined
    const allSessions: ApiSession[] = []

    while (offset < totalCount) {
      const response = await fetch(
        `/api/sessions?limit=${SESSIONS_PAGE_SIZE}&offset=${offset}`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch sessions')
      }

      const data: SessionsResponse = await response.json()
      allSessions.push(...data.sessions)
      latestStatus = data.status || latestStatus

      const pageCount = data.sessions.length
      const reportedTotal = data.totalCount ?? allSessions.length
      totalCount = reportedTotal

      if (pageCount === 0 || pageCount < SESSIONS_PAGE_SIZE) {
        break
      }

      offset += pageCount
    }

    setSessions(
      allSessions.map((session) => ({
        sessionId: session.sessionId,
        chatId: session.chatId,
        firstSeenAt: session.firstSeenAt,
        requestStartedAt: session.requestStartedAt,
        requestEndedAt: session.requestEndedAt,
        requestElapsedMs: session.requestElapsedMs,
        requestPromptProcessingMs: session.requestPromptProcessingMs,
        requestToolCallCount: session.requestToolCallCount,
        requestTokensPerSecond: session.requestTokensPerSecond,
        model: session.model,
        promptTokens: session.promptTokens,
        completionTokens: session.completionTokens,
        streamLatencyMs: session.streamLatencyMs,
        client: session.client,
        sessionGroupId: session.sessionGroupId,
        sessionGroupKey: session.sessionGroupKey,
        sessionName: session.sessionName,
        sessionStartedAt: session.sessionStartedAt,
        sessionModel: session.sessionModel,
        sessionClient: session.sessionClient,
        sessionRequestCount: session.sessionRequestCount,
        sessionTotalInputTokens: session.sessionTotalInputTokens,
        sessionTotalOutputTokens: session.sessionTotalOutputTokens,
        sessionAverageTokensPerSecond: session.sessionAverageTokensPerSecond,
        sessionTotalPromptProcessingMs: session.sessionTotalPromptProcessingMs,
      }))
    )

    if (latestStatus) {
      setStatus(latestStatus)
    }

    return {
      sessions: allSessions,
      totalCount: allSessions.length,
      status: latestStatus,
    }
  }, [])

  const fetchStatus = useCallback(async (): Promise<IndexStatus | null> => {
    const response = await fetch('/api/index')
    if (!response.ok) {
      return null
    }

    const data: IndexStatusResponse = await response.json()
    const nextStatus = data.status || null
    setStatus(nextStatus)
    return nextStatus
  }, [])

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const maybeRunSessionRenamer = useCallback(
    async (nextStatus: IndexStatus | null | undefined) => {
      try {
        if (nextStatus?.state !== 'ready') {
          return
        }

        const settingsResponse = await fetch('/api/settings')
        if (!settingsResponse.ok) {
          return
        }

        const settingsData =
          (await settingsResponse.json()) as AiSessionRenamerSettingsResponse
        if (!settingsData.settings.enableSessionRenamer) {
          return
        }

        const runKey =
          nextStatus.finishedAt || `${nextStatus.sessionsIndexed}:${nextStatus.state}`
        if (renamerRunKeyRef.current === runKey) {
          return
        }

        renamerRunKeyRef.current = runKey

        let refreshInFlight = false
        const liveRefreshTimer = setInterval(() => {
          void (async () => {
            if (refreshInFlight) {
              return
            }

            refreshInFlight = true
            try {
              await fetchSessions()
            } catch (refreshError) {
              console.error('Failed to refresh sessions during renamer run:', refreshError)
            } finally {
              refreshInFlight = false
            }
          })()
        }, RENAMER_LIVE_REFRESH_MS)

        try {
          const renameResponse = await fetch('/api/session-renamer/run', {
            method: 'POST',
          })
          if (!renameResponse.ok) {
            return
          }

          const renameResult = (await renameResponse.json()) as {
            updatedCount?: number
          }
          if ((renameResult.updatedCount || 0) > 0) {
            await fetchSessions()
            return
          }

          await fetchSessions()
        } finally {
          clearInterval(liveRefreshTimer)
        }
      } catch (error) {
        console.error('Failed to run session renamer:', error)
      }
    },
    [fetchSessions]
  )

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) {
      return
    }

    pollTimerRef.current = setInterval(() => {
      void (async () => {
        const nextStatus = await fetchStatus()
        if (!nextStatus) {
          return
        }

        if (nextStatus.state === 'indexing') {
          await fetchSessions()
          setLoading(false)
          return
        }

        if (nextStatus.state === 'ready' || nextStatus.state === 'error') {
          await fetchSessions()
          await maybeRunSessionRenamer(nextStatus)
          stopPolling()
          setLoading(false)
        }
      })()
    }, POLL_MS)
  }, [fetchSessions, fetchStatus, maybeRunSessionRenamer, stopPolling])

  const bootstrap = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      await fetch('/api/index', { method: 'POST' })
      const data = await fetchSessions()
      const nextStatus = data.status || (await fetchStatus())

      if (nextStatus?.state === 'indexing') {
        startPolling()
      }

      await maybeRunSessionRenamer(nextStatus)

      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setLoading(false)
    }
  }, [fetchSessions, fetchStatus, maybeRunSessionRenamer, startPolling])

  useEffect(() => {
    void bootstrap()

    return () => {
      stopPolling()
    }
  }, [bootstrap, stopPolling])

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      await fetch('/api/index?force=1', { method: 'POST' })
      const data = await fetchSessions()
      const nextStatus = data.status || (await fetchStatus())
      if (nextStatus?.state === 'indexing') {
        startPolling()
      }
      await maybeRunSessionRenamer(nextStatus)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setLoading(false)
    }
  }, [fetchSessions, fetchStatus, maybeRunSessionRenamer, startPolling])

  const progress = useMemo(() => {
    if (!status || status.totalFiles <= 0) {
      return 0
    }

    return Math.min(
      100,
      Math.floor((status.processedFiles / status.totalFiles) * 100)
    )
  }, [status])

  return {
    sessions,
    loading,
    error,
    refresh,
    indexStatus: status,
    indexingProgress: progress,
  }
}
