'use client'

import { useEffect, useState } from 'react'

interface SessionResponse {
  session: SessionData
}

interface SessionData {
  chatId: string
  firstSeenAt: string
  model?: string
  request?: RequestData
  events: TimelineEvent[]
  toolCalls: ToolCallItem[]
  metrics: SessionMetrics
}

interface RequestData {
  endpoint: string
  method: string
  body: Record<string, unknown>
}

interface TimelineEvent {
  id: string
  type:
    | 'request'
    | 'prompt_progress'
    | 'stream_chunk'
    | 'tool_call'
    | 'usage'
    | 'stream_finished'
  ts: string
  data?: unknown
}

interface ToolCallItem {
  id: string
  name: string
  argumentsText: string
  argumentsJson?: Record<string, unknown>
}

interface SessionMetrics {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  promptProcessingMs?: number
  streamLatencyMs?: number
  tokensPerSecond?: number
}

export function useSessionDetails(chatId: string) {
  const [data, setData] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!chatId) return

    async function fetchSession() {
      try {
        setLoading(true)
        const response = await fetch(
          `/api/sessions/chatId?chatId=${encodeURIComponent(chatId)}`
        )

        if (!response.ok) {
          throw new Error('Failed to fetch session details')
        }

        const result: SessionResponse = await response.json()
        setData(result.session)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    void fetchSession()
  }, [chatId])

  return { data, loading, error }
}
