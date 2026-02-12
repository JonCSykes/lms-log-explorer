import anthropicPlugin from '@genkit-ai/anthropic'
import { openAI } from '@genkit-ai/compat-oai/openai'
import { googleAI } from '@genkit-ai/google-genai'
import { genkit } from 'genkit'

import { type Session } from '@/types'

import {
  listSessionGroupNames,
  loadAiSettings,
  upsertSessionGroupName,
} from '../indexer/sqliteStore'
import { getSessionIndex } from '../sessionIndex'

import { type AiProvider } from './settings'

export interface SessionRenameRunResult {
  processedCount: number
  updatedCount: number
  skippedCount: number
  errors: string[]
}

interface SessionGroupCandidate {
  sessionGroupId: string
  latestSession: Session
}

type TokenSource = 'env' | 'custom' | 'none'

interface ResolvedProviderToken {
  token?: string
  source: TokenSource
}

function parseTimestampMs(value?: string): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = new Date(value).getTime()
  if (!Number.isFinite(parsed)) {
    return undefined
  }

  return parsed
}

function normalizeMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content.map((part) => normalizeMessageContent(part)).join('\n')
  }

  if (content === null || content === undefined) {
    return ''
  }

  if (typeof content === 'object') {
    return JSON.stringify(content, null, 2)
  }

  return String(content)
}

function sanitizeSessionName(raw: string): string | undefined {
  const firstLine = raw.split('\n')[0]?.trim()
  if (!firstLine) {
    return undefined
  }

  const withoutPrefix = firstLine.replace(/^session\s*name\s*:\s*/i, '')
  const unquoted = withoutPrefix.replace(/^["'`]+|["'`]+$/g, '')
  const collapsed = unquoted.replace(/\s+/g, ' ').trim()
  if (!collapsed) {
    return undefined
  }

  return collapsed.slice(0, 80)
}

function normalizeApiToken(value?: string): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) {
    return undefined
  }

  const withoutBearer = trimmed.replace(/^bearer\s+/i, '')
  const unquoted = withoutBearer.replace(/^["'`]+|["'`]+$/g, '').trim()
  return unquoted || undefined
}

function getEnvApiToken(provider: AiProvider): string | undefined {
  if (provider === 'openai') {
    return normalizeApiToken(process.env.OPENAI_API_KEY)
  }
  if (provider === 'anthropic') {
    return normalizeApiToken(process.env.ANTHROPIC_API_KEY)
  }

  return (
    normalizeApiToken(process.env.GEMINI_API_KEY) ||
    normalizeApiToken(process.env.GOOGLE_API_KEY)
  )
}

function resolveProviderToken(
  provider: AiProvider,
  customToken: string | undefined,
  overrideApiToken: boolean
): ResolvedProviderToken {
  const normalizedCustomToken = normalizeApiToken(customToken)
  const envToken = getEnvApiToken(provider)

  if (overrideApiToken) {
    if (normalizedCustomToken) {
      return { token: normalizedCustomToken, source: 'custom' }
    }
    if (envToken) {
      return { token: envToken, source: 'env' }
    }
    return { source: 'none' }
  }

  if (envToken) {
    return { token: envToken, source: 'env' }
  }
  if (normalizedCustomToken) {
    return { token: normalizedCustomToken, source: 'custom' }
  }

  return { source: 'none' }
}

function providerEnvHint(provider: AiProvider): string {
  if (provider === 'openai') {
    return 'OPENAI_API_KEY'
  }
  if (provider === 'anthropic') {
    return 'ANTHROPIC_API_KEY'
  }

  return 'GEMINI_API_KEY'
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown error'
}

function enrichProviderError(
  provider: AiProvider,
  tokenSource: TokenSource,
  message: string
): string {
  const normalized = message.toLowerCase()
  if (
    normalized.includes('api key not found') ||
    normalized.includes('invalid api key')
  ) {
    const sourceLabel = tokenSource === 'custom' ? 'custom token' : 'environment token'
    return `Invalid ${provider} API key (${sourceLabel}). Verify the value in Settings or ${providerEnvHint(provider)}.`
  }

  return message
}

function getLatestSessionTs(session: Session): number {
  const requestTs = parseTimestampMs(session.request?.ts)
  const fallbackTs = parseTimestampMs(session.firstSeenAt)
  return requestTs ?? fallbackTs ?? 0
}

function buildSessionGroupCandidates(sessions: Session[]): SessionGroupCandidate[] {
  const byGroup = new Map<string, SessionGroupCandidate>()

  for (const session of sessions) {
    const existing = byGroup.get(session.sessionGroupId)
    if (!existing) {
      byGroup.set(session.sessionGroupId, {
        sessionGroupId: session.sessionGroupId,
        latestSession: session,
      })
      continue
    }

    if (getLatestSessionTs(session) > getLatestSessionTs(existing.latestSession)) {
      existing.latestSession = session
    }
  }

  return [...byGroup.values()].sort((left, right) => {
    return getLatestSessionTs(right.latestSession) - getLatestSessionTs(left.latestSession)
  })
}

function buildPromptAuditConversation(session: Session): string {
  const messages = session.request?.body.messages
  if (!Array.isArray(messages)) {
    return ''
  }

  const lines: string[] = []
  for (const message of messages) {
    const roleValue = (message as { role?: unknown }).role
    const role = typeof roleValue === 'string' ? roleValue : ''
    if (role === 'system') {
      continue
    }
    if (role !== 'user' && role !== 'assistant' && role !== 'developer') {
      continue
    }

    const content = normalizeMessageContent(
      (message as { content?: unknown }).content
    ).trim()
    if (!content) {
      continue
    }

    const snippet = content.length > 1600 ? `${content.slice(0, 1600)}...` : content
    lines.push(`${role.toUpperCase()}: ${snippet}`)
  }

  const conversation = lines.join('\n\n')
  if (conversation.length <= 12_000) {
    return conversation
  }

  return conversation.slice(0, 12_000)
}

async function generateSessionName(
  provider: AiProvider,
  model: string,
  apiToken: string,
  conversation: string
): Promise<string | undefined> {
  if (!conversation.trim()) {
    return undefined
  }

  const plugins =
    provider === 'google'
      ? [googleAI({ apiKey: apiToken })]
      : provider === 'openai'
        ? [openAI({ apiKey: apiToken })]
        : [anthropicPlugin({ apiKey: apiToken })]
  const ai = genkit({ plugins })

  const modelRef =
    provider === 'google'
      ? googleAI.model(model)
      : provider === 'openai'
        ? openAI.model(model)
        : anthropicPlugin.model(model)

  const result = await ai.generate({
    model: modelRef,
    prompt: `You are a naming assistant.
Generate a short, specific session title that summarizes what the user worked on.
Use 3 to 8 words.
Do not include quotes, punctuation decoration, or prefixes.
Respond with only the title.

Conversation:
${conversation}`,
  })

  return sanitizeSessionName(result.text || '')
}

export async function runSessionRenamer(): Promise<SessionRenameRunResult> {
  try {
    const settings = loadAiSettings()
    if (!settings.enableSessionRenamer) {
      return {
        processedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errors: [],
      }
    }

    const configuredToken = settings.apiTokenByProvider[settings.provider]
    const resolvedProviderToken = resolveProviderToken(
      settings.provider,
      configuredToken,
      settings.overrideApiToken
    )
    if (!resolvedProviderToken.token) {
      return {
        processedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errors: [
          `Missing API token for provider: ${settings.provider}. Configure ${providerEnvHint(settings.provider)} or set a token in Settings.`,
        ],
      }
    }

    const index = await getSessionIndex()
    const existingSessionNames = listSessionGroupNames()
    const candidates = buildSessionGroupCandidates([...index.sessions.values()]).filter(
      (candidate) => {
        const existingName = existingSessionNames.get(candidate.sessionGroupId)
        return !existingName || existingName.trim().length === 0
      }
    )

    let processedCount = 0
    let updatedCount = 0
    let skippedCount = 0
    const errors: string[] = []

    for (const candidate of candidates) {
      processedCount += 1

      const conversation = buildPromptAuditConversation(candidate.latestSession)
      if (!conversation) {
        skippedCount += 1
        continue
      }

      try {
        const name = await generateSessionName(
          settings.provider,
          settings.model,
          resolvedProviderToken.token,
          conversation
        )
        if (!name) {
          skippedCount += 1
          continue
        }

        upsertSessionGroupName(candidate.sessionGroupId, name)
        updatedCount += 1
      } catch (error) {
        const message = enrichProviderError(
          settings.provider,
          resolvedProviderToken.source,
          toErrorMessage(error)
        )
        errors.push(`${candidate.sessionGroupId}: ${message}`)
      }
    }

    return {
      processedCount,
      updatedCount,
      skippedCount,
      errors,
    }
  } catch (error) {
    const message = toErrorMessage(error)
    return {
      processedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errors: [message],
    }
  }
}
