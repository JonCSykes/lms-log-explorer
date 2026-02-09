import { type Dirent, existsSync, readFileSync, readdirSync } from 'node:fs'
import * as path from 'node:path'

import { type NextRequest, NextResponse } from 'next/server'

function getLogRoot(): string {
  const envRoot = process.env.LMS_LOG_ROOT
  if (envRoot) {
    return expandHome(envRoot)
  }
  const home = process.env.HOME || ''
  return path.join(home, '.lmstudio', 'server-logs')
}

function expandHome(p: string): string {
  if (p.startsWith('~')) {
    const home = process.env.HOME || ''
    return path.join(home, p.slice(1))
  }
  return p
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const chatId = url.searchParams.get('chatId')

    if (!chatId) {
      return NextResponse.json(
        { error: 'Missing chatId parameter' },
        { status: 400 }
      )
    }

    const logRoot = getLogRoot()

    if (!existsSync(logRoot)) {
      return NextResponse.json(
        { error: `Log directory not found: ${logRoot}` },
        { status: 404 }
      )
    }

    // Discover month folders
    const entries: Dirent[] = readdirSync(logRoot, { withFileTypes: true })

    const monthFolders = entries
      .filter((e) => e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name))
      .map((e) => e.name)
      .sort()
      .reverse()

    // Find and parse the session
    for (const month of monthFolders) {
      const monthPath = path.join(logRoot, month)

      if (!existsSync(monthPath)) {
        continue
      }

      const files: Dirent[] = readdirSync(monthPath, { withFileTypes: true })

      for (const file of files) {
        if (file.isFile() && file.name.endsWith('.log')) {
          const filePath = path.join(monthPath, file.name)

          try {
            const content = readFileSync(filePath, 'utf-8')
            const lines = content.split('\n')

            for (const line of lines) {
              // Check for packet with matching chat ID
              const packetMatch = /"id":"(chatcmpl-[^"]+)"/.exec(line)
              const packetChatId = packetMatch?.[1]
              if (packetChatId === chatId) {
                // Found the session, build response
                const firstSeenAt = parseLineTimestamp(line)

                // Simple parsing - extract basic info
                const events: {
                  id: string
                  type: string
                  ts: string
                  data?: unknown
                }[] = []
                let model: string | undefined
                let eventCounter = 0

                for (const logLine of lines) {
                  const ts = parseLineTimestamp(logLine)
                  if (!ts) continue

                  // Check for usage data
                  const usageMatch = /"usage":\s*{([^}]+)}/.exec(logLine)
                  const usagePayload = usageMatch?.[1]
                  if (usagePayload) {
                    try {
                      const usage = JSON.parse(`{${usagePayload}}`) as unknown
                      events.push({
                        id: `usage-${eventCounter++}`,
                        type: 'usage' as const,
                        ts,
                        data: usage,
                      })
                    } catch {
                      // Skip invalid JSON
                    }
                  }

                  // Check for tool calls
                  if (logLine.includes('tool_calls')) {
                    events.push({
                      id: `tool_call-${eventCounter++}`,
                      type: 'tool_call' as const,
                      ts,
                      data: null,
                    })
                  }

                  // Check for stream finished
                  if (logLine.includes('Finished streaming response')) {
                    events.push({
                      id: `finished-${eventCounter++}`,
                      type: 'stream_finished' as const,
                      ts,
                    })
                  }
                }

                // Determine model from request or first packet
                for (const logLine of lines) {
                  if (logLine.includes('with body')) {
                    const jsonMatch = /\{[\s\S]*\}/.exec(logLine)
                    const bodyJson = jsonMatch?.[0]
                    if (bodyJson) {
                      try {
                        const body = JSON.parse(bodyJson) as { model?: unknown }
                        if (typeof body.model === 'string') {
                          model = body.model
                        }
                        break
                      } catch {
                        // Skip
                      }
                    }
                  }
                }

                return NextResponse.json({
                  session: {
                    chatId,
                    firstSeenAt: firstSeenAt ?? new Date().toISOString(),
                    model,
                    events,
                    toolCalls: [],
                    metrics: {
                      promptTokens: undefined,
                      completionTokens: undefined,
                      totalTokens: undefined,
                    },
                  },
                })
              }
            }
          } catch (e) {
            console.error(`Failed to read file: ${filePath}`, e)
          }
        }
      }
    }

    return NextResponse.json(
      { error: `Session not found: ${chatId}` },
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

function parseLineTimestamp(line: string): string | undefined {
  const tsMatch = /^\[([^\]]+)\]/.exec(line)
  const timestamp = tsMatch?.[1]
  if (!timestamp) {
    return undefined
  }
  return `${timestamp}Z`
}
