import { existsSync } from 'node:fs'

import { type NextRequest, NextResponse } from 'next/server'

import { getLogRoot } from '@/lib/indexer/discovery'
import {
  getCachedSessionIndex,
  getIndexingStatus,
  initializeSessionIndex,
} from '@/lib/sessionIndex'

export async function GET(_request: NextRequest) {
  try {
    const logRoot = getLogRoot()
    const exists = existsSync(logRoot)
    const status = getIndexingStatus()
    const index = getCachedSessionIndex()

    if (!exists) {
      return NextResponse.json(
        {
          ready: false,
          logRoot,
          status,
          message: `Log directory not found at ${logRoot}`,
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ready: status.state === 'ready',
      logRoot,
      sessionCount: index.sessions.size,
      indexedAt: index.indexedAt.toISOString(),
      status,
    })
  } catch (error) {
    console.error('Error checking index:', error)
    return NextResponse.json(
      {
        ready: false,
        error: 'Failed to check index status',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const forceRefresh = url.searchParams.get('force') === '1'

    void initializeSessionIndex({ forceRefresh })

    const status = getIndexingStatus()
    const index = getCachedSessionIndex()
    return NextResponse.json(
      {
        ready: status.state === 'ready',
        sessionCount: index.sessions.size,
        indexedAt: index.indexedAt.toISOString(),
        status,
      },
      { status: 202 }
    )
  } catch (error) {
    console.error('Error scheduling index rebuild:', error)
    return NextResponse.json(
      {
        ready: false,
        error: 'Failed to schedule index rebuild',
      },
      { status: 500 }
    )
  }
}
