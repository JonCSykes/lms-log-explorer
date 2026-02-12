export const AI_PROVIDERS = ['google', 'openai', 'anthropic'] as const

export type AiProvider = (typeof AI_PROVIDERS)[number]

export const AI_MODELS_BY_PROVIDER: Record<AiProvider, string[]> = {
  google: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
  openai: ['gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini'],
  anthropic: [
    'claude-sonnet-4-5',
    'claude-opus-4-1',
    'claude-3-5-haiku-latest',
  ],
}

export interface AiSessionRenamerSettings {
  enableSessionRenamer: boolean
  provider: AiProvider
  model: string
  overrideApiToken: boolean
  apiTokenByProvider: Partial<Record<AiProvider, string>>
}

export interface AiSessionRenamerSettingsResponse {
  settings: AiSessionRenamerSettings
  envApiTokenByProvider: Partial<Record<AiProvider, string>>
}

export const DEFAULT_AI_PROVIDER: AiProvider = 'google'

export function isAiProvider(value: string): value is AiProvider {
  return AI_PROVIDERS.includes(value as AiProvider)
}

export function getDefaultModelForProvider(provider: AiProvider): string {
  const models = AI_MODELS_BY_PROVIDER[provider]
  return models[0] || ''
}

export function normalizeAiSettings(value: unknown): AiSessionRenamerSettings {
  const candidate =
    value && typeof value === 'object'
      ? (value as Partial<AiSessionRenamerSettings>)
      : {}

  const providerCandidate =
    typeof candidate.provider === 'string' ? candidate.provider : ''
  const provider: AiProvider = isAiProvider(providerCandidate)
    ? providerCandidate
    : DEFAULT_AI_PROVIDER
  const allowedModels = AI_MODELS_BY_PROVIDER[provider]
  const model =
    typeof candidate.model === 'string' && allowedModels.includes(candidate.model)
      ? candidate.model
      : getDefaultModelForProvider(provider)

  const apiTokenByProvider: Partial<Record<AiProvider, string>> = {}
  if (candidate.apiTokenByProvider && typeof candidate.apiTokenByProvider === 'object') {
    for (const providerName of AI_PROVIDERS) {
      const token = candidate.apiTokenByProvider[providerName]
      if (typeof token === 'string' && token.trim().length > 0) {
        apiTokenByProvider[providerName] = token
      }
    }
  }

  return {
    enableSessionRenamer: candidate.enableSessionRenamer === true,
    provider,
    model,
    overrideApiToken: candidate.overrideApiToken === true,
    apiTokenByProvider,
  }
}
