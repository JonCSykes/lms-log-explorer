'use client'

import { useEffect, useState } from 'react'

import { type ClientType } from '@/types'

interface SessionResponse {
  session: SessionData | null
  message?: string
}

interface SessionData {
  sessionId: string
  chatId?: string
  firstSeenAt: string
  model?: string
  client?: ClientType
  sessionGroupId?: string
  sessionGroupKey?: string
  sessionGroup?: SessionGroupSummary
  request?: RequestData
  events: TimelineEvent[]
  toolCalls: ToolCallItem[]
  metrics: SessionMetrics
}

interface SessionGroupSummary {
  sessionGroupId: string
  sessionGroupKey: string
  sessionStartedAt: string
  sessionModel?: string
  sessionClient: ClientType
  sessionRequestCount: number
  sessionTotalInputTokens?: number
  sessionTotalOutputTokens?: number
  sessionAverageTokensPerSecond?: number
  sessionTotalPromptProcessingMs?: number
}

interface RequestData {
  id?: string
  type?: 'request'
  ts?: string
  endpoint: string
  method: string
  body: Record<string, unknown>
}

interface TimelineEvent {
  id: string
  type:
    | 'request'
    | 'prompt_processing'
    | 'stream_chunk'
    | 'tool_call'
    | 'usage'
    | 'stream_finished'
  ts: string
  data?: unknown
}

function ensureRequestEvent(
  events: TimelineEvent[],
  request: RequestData | undefined
): TimelineEvent[] {
  if (!request) {
    return events
  }

  const hasRequestEvent = events.some((event) => event.type === 'request')
  if (hasRequestEvent) {
    return events
  }

  const requestTs = request.ts || events[0]?.ts || new Date().toISOString()
  const requestId = request.id || `request-${requestTs}`

  return [
    {
      id: requestId,
      type: 'request',
      ts: requestTs,
      data: {
        method: request.method,
        endpoint: request.endpoint,
        body: request.body,
      },
    },
    ...events,
  ]
}

interface ToolCallItem {
  id: string
  name: string
  argumentsText: string
  argumentsJson?: Record<string, unknown>
  requestedAt?: string
  durationMs?: number
}

interface SessionMetrics {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  promptProcessingMs?: number
  streamLatencyMs?: number
  tokensPerSecond?: number
}

export function useSessionDetails(sessionId: string) {
  const [data, setData] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    async function fetchSession() {
      try {
        setLoading(true)
        const response = await fetch(
          `/api/sessions/chatId?sessionId=${encodeURIComponent(sessionId)}`
        )

        if (!response.ok) {
          throw new Error('Failed to fetch session details')
        }

        const result: SessionResponse = await response.json()
        const session = result.session
        if (!session) {
          setData(null)
          return
        }

        setData({
          ...session,
          events: ensureRequestEvent(session.events, session.request),
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    void fetchSession()
  }, [sessionId])

  return { data, loading, error }
}
