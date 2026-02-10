'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface Session {
  sessionId: string
  chatId?: string
  firstSeenAt: string
  model?: string
}

interface ApiSession {
  sessionId: string
  chatId?: string
  firstSeenAt: string
  model?: string
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

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<IndexStatus | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
        model: session.model,
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
          stopPolling()
          setLoading(false)
        }
      })()
    }, POLL_MS)
  }, [fetchSessions, fetchStatus, stopPolling])

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

      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setLoading(false)
    }
  }, [fetchSessions, fetchStatus, startPolling])

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
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setLoading(false)
    }
  }, [fetchSessions, fetchStatus, startPolling])

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
