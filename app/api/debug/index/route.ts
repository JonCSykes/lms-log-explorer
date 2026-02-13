import { NextResponse } from 'next/server'

import { getSessionList } from '@/lib/indexer'
import { getIndexingStatus, getSessionIndex } from '@/lib/sessionIndex'

export const runtime = 'nodejs'

export async function GET() {
  if (process.env.DEBUG !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const index = await getSessionIndex()
    const sessions = getSessionList(index)

    return NextResponse.json({
      status: getIndexingStatus(),
      summary: {
        sessionCount: index.sessions.size,
        indexedAt: index.indexedAt.toISOString(),
      },
      sampleSessions: sessions.slice(0, 25),
      sampleTruncated: sessions.length > 25,
    })
  } catch (error) {
    console.error('Failed to fetch debug index summary:', error)
    return NextResponse.json(
      { error: 'Failed to fetch debug index summary' },
      { status: 500 }
    )
  }
}
