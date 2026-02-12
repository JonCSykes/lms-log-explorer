import { type NextRequest, NextResponse } from 'next/server'

import { getSessionList } from '@/lib/indexer'
import {
  getIndexingStatus,
  getSessionIndex,
  initializeSessionIndex,
} from '@/lib/sessionIndex'

interface QueryParams {
  q?: string
  limit: number
  offset: number
}

function parseQueryParams(request: NextRequest): QueryParams {
  const url = new URL(request.url)

  const parsedLimit = Number.parseInt(url.searchParams.get('limit') || '50', 10)
  const parsedOffset = Number.parseInt(
    url.searchParams.get('offset') || '0',
    10
  )

  return {
    q: url.searchParams.get('q') || undefined,
    limit: Number.isNaN(parsedLimit) ? 50 : Math.max(0, parsedLimit),
    offset: Number.isNaN(parsedOffset) ? 0 : Math.max(0, parsedOffset),
  }
}

export async function GET(request: NextRequest) {
  try {
    const params = parseQueryParams(request)
    const index = await getSessionIndex()
    const status = getIndexingStatus()

    if (index.sessions.size === 0 && status.state === 'idle') {
      void initializeSessionIndex()
    }

    let sessions = getSessionList(index)
    if (params.q) {
      const queryLower = params.q.toLowerCase()
      sessions = sessions.filter((session) => {
        const chatId = session.chatId || ''
        const sessionName = session.sessionName || ''
        return `${chatId} ${session.sessionId}`
          .concat(` ${sessionName}`)
          .toLowerCase()
          .includes(queryLower)
      })
    }

    const paginatedSessions = sessions.slice(
      params.offset,
      params.offset + params.limit
    )

    return NextResponse.json({
      sessions: paginatedSessions,
      totalCount: sessions.length,
      status: getIndexingStatus(),
    })
  } catch (error) {
    console.error('Error fetching sessions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    )
  }
}
