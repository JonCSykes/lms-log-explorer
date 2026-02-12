import { type NextRequest, NextResponse } from 'next/server'

import { normalizeAiSettings } from '@/lib/ai/settings'
import type {
  AiProvider,
  AiSessionRenamerSettings,
  AiSessionRenamerSettingsResponse,
} from '@/lib/ai/settings'
import {
  loadAiSettings,
  saveAiSettings,
} from '@/lib/indexer/sqliteStore'

export const runtime = 'nodejs'

function sanitizeApiToken(token?: string): string {
  const trimmed = token?.trim()
  if (!trimmed) {
    return ''
  }

  return trimmed.replace(/^["'`]+|["'`]+$/g, '')
}

function getEnvApiTokens(): Partial<Record<AiProvider, string>> {
  return {
    openai: sanitizeApiToken(process.env.OPENAI_API_KEY),
    anthropic: sanitizeApiToken(process.env.ANTHROPIC_API_KEY),
    google: sanitizeApiToken(
      process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
    ),
  }
}

function buildSettingsResponse(
  settings: AiSessionRenamerSettings
): AiSessionRenamerSettingsResponse {
  return {
    settings,
    envApiTokenByProvider: getEnvApiTokens(),
  }
}

export async function GET() {
  try {
    const settings = normalizeAiSettings(loadAiSettings())
    return NextResponse.json(buildSettingsResponse(settings))
  } catch (error) {
    console.error('Failed to load settings:', error)
    return NextResponse.json(
      { error: 'Failed to load settings' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      settings?: unknown
    }
    const settings = normalizeAiSettings(body.settings ?? body)
    saveAiSettings(settings)

    return NextResponse.json(buildSettingsResponse(settings))
  } catch (error) {
    console.error('Failed to save settings:', error)
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    )
  }
}
