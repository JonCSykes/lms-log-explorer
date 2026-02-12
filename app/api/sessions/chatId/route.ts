import { type NextRequest, NextResponse } from 'next/server'

import { getSession, getSessionGroupSummary } from '@/lib/indexer'
import {
  getIndexingStatus,
  getSessionIndex,
  initializeSessionIndex,
} from '@/lib/sessionIndex'

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const sessionIdOrChatId =
      url.searchParams.get('sessionId') || url.searchParams.get('chatId')

    if (!sessionIdOrChatId) {
      return NextResponse.json(
        { error: 'Missing sessionId or chatId parameter' },
        { status: 400 }
      )
    }

    const index = await getSessionIndex()
    const session = getSession(index, sessionIdOrChatId)
    if (session) {
      const sessionGroup = getSessionGroupSummary(index, session.sessionGroupId)
      const toolCalls = session.toolCalls.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.name,
        argumentsText: toolCall.argumentsText,
        argumentsJson: toolCall.argumentsJson,
        requestedAt: toolCall.ts,
      }))

      return NextResponse.json({
        session: {
          sessionId: session.sessionId,
          chatId: session.chatId,
          firstSeenAt: session.firstSeenAt,
          model: session.model,
          client: session.client,
          sessionGroupId: session.sessionGroupId,
          sessionGroupKey: session.sessionGroupKey,
          systemMessageChecksum: session.systemMessageChecksum,
          userMessageChecksum: session.userMessageChecksum,
          sessionGroup,
          request: session.request,
          events: session.events,
          toolCalls,
          metrics: session.metrics,
        },
      })
    }

    const status = getIndexingStatus()
    if (index.sessions.size === 0 && status.state === 'idle') {
      void initializeSessionIndex()
      return NextResponse.json(
        {
          session: null,
          status: getIndexingStatus(),
          message: 'Indexing started. Retry shortly.',
        },
        { status: 202 }
      )
    }

    if (status.state === 'indexing') {
      return NextResponse.json(
        {
          session: null,
          status,
          message: 'Indexing in progress. Retry shortly.',
        },
        { status: 202 }
      )
    }

    return NextResponse.json(
      { error: `Session not found: ${sessionIdOrChatId}` },
      { status: 404 }
    )
  } catch (error) {
    console.error('Error fetching session:', error)
    return NextResponse.json(
      { error: 'Failed to fetch session' },
      { status: 500 }
    )
  }
}
