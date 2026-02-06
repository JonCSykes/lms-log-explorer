'use client'

import { useEffect, useState } from 'react'

interface Session {
  chatId: string
  firstSeenAt: string
  model?: string
}

interface ApiSession {
  chatId: string
  firstSeenAt: string
  model?: string
  promptTokens?: number
  completionTokens?: number
}

interface SessionsResponse {
  sessions: ApiSession[]
  totalCount?: number
}

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchSessions() {
      try {
        setLoading(true)
        const response = await fetch('/api/sessions')
        
        if (!response.ok) {
          throw new Error('Failed to fetch sessions')
        }
        
        const data: SessionsResponse = await response.json()
        
        setSessions(
          data.sessions.map((s) => ({
            chatId: s.chatId,
            firstSeenAt: s.firstSeenAt,
            model: s.model,
          }))
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchSessions()
  }, [])

  return { sessions, loading, error }
}
