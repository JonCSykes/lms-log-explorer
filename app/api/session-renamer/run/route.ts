import { NextResponse } from 'next/server'

import { runSessionRenamer } from '@/lib/ai/sessionRenamer'

export const runtime = 'nodejs'

export async function POST() {
  try {
    const result = await runSessionRenamer()
    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to run session renamer:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({
      processedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errors: [message],
    })
  }
}
