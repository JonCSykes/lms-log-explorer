'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AI_MODELS_BY_PROVIDER,
  AI_PROVIDERS,
  getDefaultModelForProvider,
  normalizeAiSettings,
} from '@/lib/ai/settings'
import type {
  AiProvider,
  AiSessionRenamerSettings,
  AiSessionRenamerSettingsResponse,
} from '@/lib/ai/settings'

function formatProviderLabel(provider: AiProvider): string {
  if (provider === 'openai') return 'OpenAI'
  if (provider === 'anthropic') return 'Anthropic'
  return 'Google'
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<AiSessionRenamerSettings>(() =>
    normalizeAiSettings(undefined)
  )
  const [envApiTokenByProvider, setEnvApiTokenByProvider] = useState<
    Partial<Record<AiProvider, string>>
  >({})

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch('/api/settings')
        if (!response.ok) {
          throw new Error('Failed to load settings')
        }

        const data = (await response.json()) as AiSessionRenamerSettingsResponse
        setSettings(normalizeAiSettings(data.settings))
        setEnvApiTokenByProvider(data.envApiTokenByProvider)
      } catch (fetchError) {
        setError(
          fetchError instanceof Error ? fetchError.message : 'Failed to load settings'
        )
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const activeProvider = settings.provider
  const providerModels = AI_MODELS_BY_PROVIDER[activeProvider]
  const envToken = envApiTokenByProvider[activeProvider] || ''
  const overrideToken = settings.apiTokenByProvider[activeProvider] || ''
  const hasEnvToken = envToken.length > 0
  const visibleApiToken =
    settings.overrideApiToken || !hasEnvToken ? overrideToken : envToken

  const isProviderSettingsEnabled = settings.enableSessionRenamer
  const tokenFieldDisabled =
    !isProviderSettingsEnabled || (!settings.overrideApiToken && hasEnvToken)

  const helperText = useMemo(() => {
    if (!isProviderSettingsEnabled) {
      return 'Enable AI Session Renamer to configure provider, model, and API token.'
    }

    if (settings.overrideApiToken) {
      return 'Using custom API token override.'
    }

    if (hasEnvToken) {
      return 'Using API token from environment variable.'
    }

    return 'No environment token detected. Enter a token or enable override.'
  }, [hasEnvToken, isProviderSettingsEnabled, settings.overrideApiToken])

  async function saveSettings() {
    try {
      setSaving(true)
      setError(null)

      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settings }),
      })

      if (!response.ok) {
        throw new Error('Failed to save settings')
      }

      const data = (await response.json()) as AiSessionRenamerSettingsResponse
      setSettings(normalizeAiSettings(data.settings))
      setEnvApiTokenByProvider(data.envApiTokenByProvider)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure AI-powered session naming.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">Back to Sessions</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI Session Renamer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading settings...</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>AI Session Renamer</Label>
                <Button
                  type="button"
                  variant={settings.enableSessionRenamer ? 'default' : 'outline'}
                  onClick={() =>
                    setSettings((current) => ({
                      ...current,
                      enableSessionRenamer: !current.enableSessionRenamer,
                    }))
                  }
                >
                  {settings.enableSessionRenamer ? 'Enabled' : 'Disabled'}
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="provider">Provider</Label>
                  <select
                    id="provider"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    value={activeProvider}
                    disabled={!isProviderSettingsEnabled}
                    onChange={(event) => {
                      const provider = event.target.value as AiProvider
                      const nextModel = getDefaultModelForProvider(provider)
                      setSettings((current) => ({
                        ...current,
                        provider,
                        model: nextModel,
                      }))
                    }}
                  >
                    {AI_PROVIDERS.map((provider) => (
                      <option key={provider} value={provider}>
                        {formatProviderLabel(provider)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  <select
                    id="model"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    value={settings.model}
                    disabled={!isProviderSettingsEnabled}
                    onChange={(event) => {
                      setSettings((current) => ({
                        ...current,
                        model: event.target.value,
                      }))
                    }}
                  >
                    {providerModels.map((modelName) => (
                      <option key={modelName} value={modelName}>
                        {modelName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    id="override-api-token"
                    type="checkbox"
                    className="size-4 rounded border-input"
                    checked={settings.overrideApiToken}
                    disabled={!isProviderSettingsEnabled}
                    onChange={(event) => {
                      const isChecked = event.target.checked
                      setSettings((current) => {
                        const currentToken =
                          current.apiTokenByProvider[current.provider] || ''
                        const nextTokens = { ...current.apiTokenByProvider }
                        if (
                          isChecked &&
                          !currentToken &&
                          (envApiTokenByProvider[current.provider] || '').length > 0
                        ) {
                          nextTokens[current.provider] =
                            envApiTokenByProvider[current.provider] || ''
                        }

                        return {
                          ...current,
                          overrideApiToken: isChecked,
                          apiTokenByProvider: nextTokens,
                        }
                      })
                    }}
                  />
                  <Label htmlFor="override-api-token">Override API Token</Label>
                </div>

                <Label htmlFor="api-token">API Token</Label>
                <Input
                  id="api-token"
                  type="password"
                  value={visibleApiToken}
                  disabled={tokenFieldDisabled}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    setSettings((current) => ({
                      ...current,
                      apiTokenByProvider: {
                        ...current.apiTokenByProvider,
                        [current.provider]: nextValue,
                      },
                    }))
                  }}
                />
                <p className="text-xs text-muted-foreground">{helperText}</p>
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <div className="flex justify-end">
                <Button type="button" onClick={() => void saveSettings()} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Settings'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
