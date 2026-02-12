'use client'

import { ChevronDown, MessageSquare, RefreshCw, X } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import TimelinePanel from '@/components/session/TimelinePanel'
import SessionsSidebar from '@/components/sessions/SessionsSidebar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ThemeToggle from '@/components/ui/theme-toggle'
import { getClientIcon } from '@/lib/clientIcons'
import { formatDurationMs } from '@/lib/duration'
import { useSessionDetails } from '@/lib/hooks/useSessionDetails'
import { useSessions } from '@/lib/hooks/useSessions'
import { type ClientType } from '@/types'

interface SessionEntry {
  sessionId: string
  chatId?: string
  firstSeenAt: string
  requestStartedAt?: string
  requestEndedAt?: string
  requestElapsedMs?: number
  requestPromptProcessingMs?: number
  requestToolCallCount?: number
  requestTokensPerSecond?: number
  model?: string
  promptTokens?: number
  completionTokens?: number
  streamLatencyMs?: number
  client: ClientType
  sessionGroupId: string
  sessionGroupKey: string
  sessionName?: string
  sessionStartedAt: string
  sessionModel?: string
  sessionClient: ClientType
  sessionRequestCount: number
  sessionTotalInputTokens?: number
  sessionTotalOutputTokens?: number
  sessionAverageTokensPerSecond?: number
  sessionTotalPromptProcessingMs?: number
}

interface SessionGroupView {
  sessionGroupId: string
  sessionName?: string
  sessionStartedAt: string
  sessionModel?: string
  sessionClient: ClientType
  sessionRequestCount: number
  sessionTotalInputTokens?: number
  sessionTotalOutputTokens?: number
  sessionAverageTokensPerSecond?: number
  sessionTotalPromptProcessingMs?: number
  sessionAveragePromptProcessingPerRequestMs?: number
  sessionTotalElapsedMs?: number
  sessionTotalIdleMs?: number
  sessionTotalAgentWorkMs?: number
  earliestRequestStartedAt?: string
  latestRequestEndedAt?: string
  requests: SessionEntry[]
}

interface PromptAuditMessage {
  id: string
  role: string
  content: string
}

interface TpsTrendPoint {
  requestId: string
  timestamp: string
  timestampMs: number
  timestampLabel: string
  tps: number | undefined
  totalTokens: number | undefined
}

interface TrendChartTooltipProps {
  active?: boolean
  payload?: Array<{
    payload?: TpsTrendPoint
  }>
}

function formatTrendTooltipValue(value: number | undefined, isTps: boolean): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Unknown'
  }

  return isTps ? value.toFixed(2) : value.toLocaleString()
}

function TrendChartTooltip({ active, payload }: TrendChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const point = payload[0]?.payload
  if (!point) {
    return null
  }

  return (
    <div className="rounded-md border border-border bg-background/95 px-3 py-2 text-xs shadow-sm backdrop-blur-sm">
      <p className="font-medium">{point.timestampLabel}</p>
      <p className="text-muted-foreground">{point.requestId}</p>
      <div className="mt-2 space-y-1">
        <p className="text-[#0ea5e9]">
          Tokens / Second: {formatTrendTooltipValue(point.tps, true)}
        </p>
        <p className="text-[#f59e0b]">
          Total Tokens: {formatTrendTooltipValue(point.totalTokens, false)}
        </p>
      </div>
    </div>
  )
}

function hasVisibleMessageContent(content: string): boolean {
  return content.trim().length > 0
}

function maxDefinedNumber(left?: number, right?: number): number | undefined {
  if (left === undefined) {
    return right
  }

  if (right === undefined) {
    return left
  }

  return Math.max(left, right)
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

function pickEarlierTimestamp(left?: string, right?: string): string | undefined {
  if (!left) return right
  if (!right) return left

  const leftMs = parseTimestampMs(left)
  const rightMs = parseTimestampMs(right)
  if (leftMs === undefined) return right
  if (rightMs === undefined) return left

  return leftMs <= rightMs ? left : right
}

function pickLaterTimestamp(left?: string, right?: string): string | undefined {
  if (!left) return right
  if (!right) return left

  const leftMs = parseTimestampMs(left)
  const rightMs = parseTimestampMs(right)
  if (leftMs === undefined) return right
  if (rightMs === undefined) return left

  return leftMs >= rightMs ? left : right
}

function normalizePromptMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    const textParts = content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }
        if (part && typeof part === 'object') {
          const candidate = part as { text?: unknown; type?: unknown }
          if (typeof candidate.text === 'string') {
            return candidate.text
          }
          if (typeof candidate.type === 'string') {
            return candidate.type
          }
        }
        return ''
      })
      .filter((part) => part.length > 0)

    if (textParts.length > 0) {
      return textParts.join('\n')
    }

    return JSON.stringify(content, null, 2)
  }

  if (content === undefined || content === null) {
    return ''
  }

  if (typeof content === 'object') {
    return JSON.stringify(content, null, 2)
  }

  return String(content)
}

export default function Home() {
  const {
    sessions,
    loading: sessionsLoading,
    refresh,
    indexStatus,
    indexingProgress,
  } = useSessions()

  const [selectedSessionGroupId, setSelectedSessionGroupId] = useState<
    string | undefined
  >(undefined)
  const [selectedRequestId, setSelectedRequestId] = useState<string | undefined>(
    undefined
  )

  const sessionGroups = useMemo<SessionGroupView[]>(() => {
    const groups = new Map<string, SessionGroupView>()

    for (const session of sessions as SessionEntry[]) {
      const existing = groups.get(session.sessionGroupId)
      if (!existing) {
        groups.set(session.sessionGroupId, {
          sessionGroupId: session.sessionGroupId,
          sessionName: session.sessionName,
          sessionStartedAt: session.sessionStartedAt,
          sessionModel: session.sessionModel,
          sessionClient: session.sessionClient,
          sessionRequestCount: session.sessionRequestCount,
          sessionTotalInputTokens: session.sessionTotalInputTokens,
          sessionTotalOutputTokens: session.sessionTotalOutputTokens,
          sessionAverageTokensPerSecond: session.sessionAverageTokensPerSecond,
          sessionTotalPromptProcessingMs: session.sessionTotalPromptProcessingMs,
          earliestRequestStartedAt:
            session.requestStartedAt || session.firstSeenAt,
          latestRequestEndedAt:
            session.requestEndedAt ||
            session.requestStartedAt ||
            session.firstSeenAt,
          requests: [session],
        })
        continue
      }

      existing.requests.push(session)

      if (
        new Date(session.sessionStartedAt).getTime() <
        new Date(existing.sessionStartedAt).getTime()
      ) {
        existing.sessionStartedAt = session.sessionStartedAt
      }

      if (!existing.sessionModel && session.sessionModel) {
        existing.sessionModel = session.sessionModel
      }

      if (!existing.sessionName && session.sessionName) {
        existing.sessionName = session.sessionName
      }

      if (existing.sessionClient === 'Unknown' && session.sessionClient !== 'Unknown') {
        existing.sessionClient = session.sessionClient
      }

      existing.sessionRequestCount = Math.max(
        existing.sessionRequestCount,
        session.sessionRequestCount,
        existing.requests.length
      )
      existing.sessionTotalInputTokens = maxDefinedNumber(
        existing.sessionTotalInputTokens,
        session.sessionTotalInputTokens
      )
      existing.sessionTotalOutputTokens = maxDefinedNumber(
        existing.sessionTotalOutputTokens,
        session.sessionTotalOutputTokens
      )
      existing.sessionTotalPromptProcessingMs = maxDefinedNumber(
        existing.sessionTotalPromptProcessingMs,
        session.sessionTotalPromptProcessingMs
      )
      existing.earliestRequestStartedAt = pickEarlierTimestamp(
        existing.earliestRequestStartedAt,
        session.requestStartedAt || session.firstSeenAt
      )
      existing.latestRequestEndedAt = pickLaterTimestamp(
        existing.latestRequestEndedAt,
        session.requestEndedAt || session.requestStartedAt || session.firstSeenAt
      )

      if (
        existing.sessionAverageTokensPerSecond === undefined &&
        session.sessionAverageTokensPerSecond !== undefined
      ) {
        existing.sessionAverageTokensPerSecond =
          session.sessionAverageTokensPerSecond
      }
    }

    return [...groups.values()]
      .map((group) => {
        const requestCount = Math.max(group.sessionRequestCount, group.requests.length)
        const averagePromptProcessingMsPerRequest =
          typeof group.sessionTotalPromptProcessingMs === 'number' && requestCount > 0
            ? group.sessionTotalPromptProcessingMs / requestCount
            : undefined
        const earliestRequestStartedAt = group.earliestRequestStartedAt
        const latestRequestEndedAt = group.latestRequestEndedAt
        const earliestRequestStartedAtMs = parseTimestampMs(earliestRequestStartedAt)
        const latestRequestEndedAtMs = parseTimestampMs(latestRequestEndedAt)
        const sessionTotalElapsedMs =
          earliestRequestStartedAtMs !== undefined &&
          latestRequestEndedAtMs !== undefined
            ? Math.max(0, latestRequestEndedAtMs - earliestRequestStartedAtMs)
            : undefined
        const sortedRequests = [...group.requests].sort((left, right) => {
          const leftMs = parseTimestampMs(left.requestStartedAt || left.firstSeenAt)
          const rightMs = parseTimestampMs(right.requestStartedAt || right.firstSeenAt)
          if (leftMs === undefined && rightMs === undefined) {
            return left.sessionId.localeCompare(right.sessionId)
          }
          if (leftMs === undefined) {
            return 1
          }
          if (rightMs === undefined) {
            return -1
          }
          return leftMs - rightMs
        })

        let sessionTotalIdleMs = 0
        for (let index = 1; index < sortedRequests.length; index += 1) {
          const previousRequest = sortedRequests[index - 1]
          const currentRequest = sortedRequests[index]
          if (!previousRequest || !currentRequest) {
            continue
          }

          const previousRequestEndMs = parseTimestampMs(
            previousRequest.requestEndedAt ||
              previousRequest.requestStartedAt ||
              previousRequest.firstSeenAt
          )
          const currentRequestStartMs = parseTimestampMs(
            currentRequest.requestStartedAt || currentRequest.firstSeenAt
          )
          if (
            previousRequestEndMs === undefined ||
            currentRequestStartMs === undefined
          ) {
            continue
          }

          const idleGap = currentRequestStartMs - previousRequestEndMs
          if (idleGap > 0) {
            sessionTotalIdleMs += idleGap
          }
        }
        const sessionTotalAgentWorkMs =
          typeof sessionTotalElapsedMs === 'number'
            ? Math.max(0, sessionTotalElapsedMs - sessionTotalIdleMs)
            : undefined

        return {
          ...group,
          sessionRequestCount: requestCount,
          sessionAveragePromptProcessingPerRequestMs:
            averagePromptProcessingMsPerRequest,
          sessionTotalElapsedMs,
          sessionTotalIdleMs,
          sessionTotalAgentWorkMs,
          requests: sortedRequests,
        }
      })
      .sort(
        (left, right) =>
          new Date(right.sessionStartedAt).getTime() -
          new Date(left.sessionStartedAt).getTime()
      )
  }, [sessions])

  useEffect(() => {
    if (sessionGroups.length === 0) {
      setSelectedSessionGroupId(undefined)
      setSelectedRequestId(undefined)
      return
    }

    if (
      !selectedSessionGroupId ||
      !sessionGroups.some((group) => group.sessionGroupId === selectedSessionGroupId)
    ) {
      setSelectedSessionGroupId(sessionGroups[0]?.sessionGroupId)
    }
  }, [selectedSessionGroupId, sessionGroups])

  const activeSessionGroup = useMemo(
    () =>
      sessionGroups.find(
        (sessionGroup) => sessionGroup.sessionGroupId === selectedSessionGroupId
      ),
    [selectedSessionGroupId, sessionGroups]
  )

  useEffect(() => {
    if (!selectedRequestId || !activeSessionGroup) {
      return
    }

    const belongsToGroup = activeSessionGroup.requests.some(
      (request) => request.sessionId === selectedRequestId
    )

    if (!belongsToGroup) {
      setSelectedRequestId(undefined)
    }
  }, [activeSessionGroup, selectedRequestId])

  const {
    data: requestData,
    loading: requestLoading,
    error: requestError,
  } = useSessionDetails(selectedRequestId || '')
  const latestSessionRequestId =
    activeSessionGroup?.requests[activeSessionGroup.requests.length - 1]
      ?.sessionId || ''
  const {
    data: promptAuditData,
    loading: promptAuditLoading,
    error: promptAuditError,
  } = useSessionDetails(latestSessionRequestId)
  const promptAuditMessages = useMemo<PromptAuditMessage[]>(() => {
    const requestBody = promptAuditData?.request?.body
    if (!requestBody || typeof requestBody !== 'object') {
      return []
    }

    const rawMessages = (requestBody as { messages?: unknown }).messages
    if (!Array.isArray(rawMessages)) {
      return []
    }

    const byContent = new Map<string, number>()
    const messages: PromptAuditMessage[] = []

    for (const message of rawMessages) {
      if (!message || typeof message !== 'object') {
        continue
      }

      const entry = message as { role?: unknown; content?: unknown }
      if (typeof entry.role !== 'string') {
        continue
      }

      const normalizedContent = normalizePromptMessageContent(entry.content)
      if (!hasVisibleMessageContent(normalizedContent)) {
        continue
      }

      const baseKey = `${entry.role}:${normalizedContent}`
      const count = (byContent.get(baseKey) || 0) + 1
      byContent.set(baseKey, count)

      messages.push({
        id: `${baseKey}:${count}`,
        role: entry.role,
        content: normalizedContent,
      })
    }

    return messages
  }, [promptAuditData])
  const conversationMessages = useMemo(
    () =>
      promptAuditMessages.filter(
        (message) => message.role === 'user' || message.role === 'assistant'
      ),
    [promptAuditMessages]
  )
  const developerMessages = useMemo(
    () => promptAuditMessages.filter((message) => message.role === 'developer'),
    [promptAuditMessages]
  )
  const systemMessages = useMemo(
    () => promptAuditMessages.filter((message) => message.role === 'system'),
    [promptAuditMessages]
  )
  const tpsTrendPoints = useMemo<TpsTrendPoint[]>(() => {
    if (!activeSessionGroup) {
      return []
    }

    return activeSessionGroup.requests
      .map((request) => {
        const pointTimestamp =
          request.requestEndedAt || request.requestStartedAt || request.firstSeenAt
        const timestampMs = parseTimestampMs(pointTimestamp)
        const requestTps =
          typeof request.requestTokensPerSecond === 'number' &&
          Number.isFinite(request.requestTokensPerSecond)
            ? request.requestTokensPerSecond
            : typeof request.completionTokens === 'number' &&
                typeof request.streamLatencyMs === 'number' &&
                request.streamLatencyMs > 0
              ? request.completionTokens / (request.streamLatencyMs / 1000)
              : undefined
        const totalTokens =
          typeof request.promptTokens === 'number' ||
          typeof request.completionTokens === 'number'
            ? (request.promptTokens || 0) + (request.completionTokens || 0)
            : undefined

        if (
          timestampMs === undefined ||
          (requestTps === undefined && totalTokens === undefined)
        ) {
          return undefined
        }

        return {
          requestId: request.sessionId,
          timestamp: pointTimestamp,
          timestampMs,
          timestampLabel: new Date(timestampMs).toLocaleTimeString(),
          tps: requestTps,
          totalTokens,
        }
      })
      .filter((point): point is TpsTrendPoint => point !== undefined)
      .sort((left, right) => left.timestampMs - right.timestampMs)
  }, [activeSessionGroup])

  const isIndexing = indexStatus?.state === 'indexing'
  const indexingDetails = indexStatus || {
    processedFiles: 0,
    totalFiles: 0,
    currentFile: undefined,
  }
  const processedFilesLabel = Math.floor(indexingDetails.processedFiles)
  const totalFilesLabel = Math.max(0, Math.floor(indexingDetails.totalFiles))

  const formatNumber = (value?: number) => {
    if (value === undefined) return 'Unknown'
    return value.toLocaleString()
  }

  const formatTokensPerSecond = (value?: number) => {
    if (value === undefined) return 'Unknown'
    return value.toFixed(2)
  }

  const formatTimestamp = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString()
  }
  const activeSessionClientIcon = activeSessionGroup
    ? getClientIcon(activeSessionGroup.sessionClient)
    : undefined

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <SessionsSidebar
          sessions={sessions}
          selectedSessionGroupId={selectedSessionGroupId}
          onSelectSessionGroup={(sessionGroupId) => {
            setSelectedSessionGroupId(sessionGroupId)
            setSelectedRequestId(undefined)
          }}
          onRefresh={refresh}
        />

        <SidebarInset className="bg-background">
          <header className="flex h-16 items-center gap-3 border-b border-border px-4">
            <SidebarTrigger className="-ml-1" />
            <div className="flex flex-1 items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Session</p>
                <h1 className="text-sm font-semibold sm:text-base">
                  {activeSessionGroup?.sessionName ||
                    activeSessionGroup?.sessionGroupId ||
                    'No session selected'}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/settings">Settings</Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => void refresh()}
                >
                  {sessionsLoading ? 'Loading...' : <RefreshCw className="size-4" />}
                  Refresh
                </Button>
                <ThemeToggle />
              </div>
            </div>
          </header>

          <main className="flex-1 space-y-4 p-4">
            {sessionsLoading && sessions.length === 0 ? (
              <div className="text-center text-muted-foreground">Loading...</div>
            ) : !activeSessionGroup ? (
              <div className="text-center text-muted-foreground">
                Select a session from the sidebar to view details.
              </div>
            ) : (
              <>
                <Card>
                  <Collapsible defaultOpen>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle>Session Overview</CardTitle>
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="group"
                            aria-label="Toggle Session Overview"
                          >
                            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    </CardHeader>
                    <CollapsibleContent>
                      <CardContent className="space-y-3">
                        <div className="grid gap-4 lg:grid-cols-2">
                          <Table>
                            <TableBody>
                              <TableRow>
                                <TableHead className="w-1/2">Client</TableHead>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {activeSessionClientIcon ? (
                                      <Image
                                        src={activeSessionClientIcon}
                                        alt={`${activeSessionGroup.sessionClient} client`}
                                        width={20}
                                        height={20}
                                        className="size-5 shrink-0"
                                      />
                                    ) : (
                                      <MessageSquare
                                        aria-label="Unknown client"
                                        className="size-5 shrink-0 text-muted-foreground"
                                      />
                                    )}
                                    <span>{activeSessionGroup.sessionClient}</span>
                                  </div>
                                </TableCell>
                              </TableRow>
                              <TableRow>
                                <TableHead className="w-1/2">Model</TableHead>
                                <TableCell>
                                  {activeSessionGroup.sessionModel || 'Unknown'}
                                </TableCell>
                              </TableRow>
                              <TableRow>
                                <TableHead>Total Requests</TableHead>
                                <TableCell>
                                  {formatNumber(activeSessionGroup.sessionRequestCount)}
                                </TableCell>
                              </TableRow>
                              <TableRow>
                                <TableHead>Total Input Tokens</TableHead>
                                <TableCell>
                                  {formatNumber(activeSessionGroup.sessionTotalInputTokens)}
                                </TableCell>
                              </TableRow>
                              <TableRow>
                                <TableHead>Total Output Tokens</TableHead>
                                <TableCell>
                                  {formatNumber(activeSessionGroup.sessionTotalOutputTokens)}
                                </TableCell>
                              </TableRow>
                              <TableRow>
                                <TableHead>Avg Tokens / Second</TableHead>
                                <TableCell>
                                  {formatTokensPerSecond(
                                    activeSessionGroup.sessionAverageTokensPerSecond
                                  )}
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>

                          <Table>
                            <TableBody>
                              <TableRow>
                                <TableHead className="w-1/2">
                                  Avg Prompt Processing
                                </TableHead>
                                <TableCell>
                                  {formatDurationMs(
                                    activeSessionGroup.sessionAveragePromptProcessingPerRequestMs
                                  )}
                                </TableCell>
                              </TableRow>
                              <TableRow>
                                <TableHead>Total Prompt Processing</TableHead>
                                <TableCell>
                                  {formatDurationMs(
                                    activeSessionGroup.sessionTotalPromptProcessingMs
                                  )}
                                </TableCell>
                              </TableRow>
                              <TableRow>
                                <TableHead>Total Agent Work Time</TableHead>
                                <TableCell>
                                  {formatDurationMs(
                                    activeSessionGroup.sessionTotalAgentWorkMs
                                  )}
                                </TableCell>
                              </TableRow>
                              <TableRow>
                                <TableHead>Total Idle Time</TableHead>
                                <TableCell>
                                  {formatDurationMs(activeSessionGroup.sessionTotalIdleMs)}
                                </TableCell>
                              </TableRow>
                              <TableRow>
                                <TableHead>Total Elapsed Time</TableHead>
                                <TableCell>
                                  {formatDurationMs(activeSessionGroup.sessionTotalElapsedMs)}
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>

                <Card>
                  <Collapsible defaultOpen>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle>Stats</CardTitle>
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="group"
                            aria-label="Toggle Stats"
                          >
                            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    </CardHeader>
                    <CollapsibleContent>
                      <CardContent className="space-y-4">
                        <div className="rounded-md border border-border bg-muted/20 p-3">
                          {tpsTrendPoints.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              Not enough request data to chart tokens per second.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-sm font-medium">
                                Request Tokens Over Time
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Highlight a range in the selector below to zoom in.
                              </p>
                              <div className="h-[18rem] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart
                                    data={tpsTrendPoints}
                                    margin={{
                                      top: 8,
                                      right: 16,
                                      left: 8,
                                      bottom: 8,
                                    }}
                                  >
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                      dataKey="timestampLabel"
                                      type="category"
                                      tickLine={false}
                                      axisLine={false}
                                      minTickGap={20}
                                    />
                                    <YAxis
                                      yAxisId="left"
                                      dataKey="tps"
                                      tickFormatter={(value) => Number(value).toFixed(1)}
                                      tickLine={false}
                                      axisLine={false}
                                      width={56}
                                    />
                                    <YAxis
                                      yAxisId="right"
                                      orientation="right"
                                      dataKey="totalTokens"
                                      tickFormatter={(value) =>
                                        Number(value).toLocaleString()
                                      }
                                      tickLine={false}
                                      axisLine={false}
                                      width={64}
                                    />
                                    <Tooltip content={<TrendChartTooltip />} />
                                    <Legend />
                                    <Line
                                      yAxisId="left"
                                      type="linear"
                                      name="Tokens / Second"
                                      dataKey="tps"
                                      stroke="#0ea5e9"
                                      strokeWidth={2}
                                      connectNulls
                                      dot={{ r: 3, fill: '#0ea5e9' }}
                                      activeDot={{ r: 5, fill: '#0ea5e9' }}
                                      isAnimationActive={false}
                                    />
                                    <Line
                                      yAxisId="right"
                                      type="linear"
                                      name="Total Tokens"
                                      dataKey="totalTokens"
                                      stroke="#f59e0b"
                                      strokeWidth={2}
                                      connectNulls
                                      dot={{ r: 3, fill: '#f59e0b' }}
                                      activeDot={{ r: 5, fill: '#f59e0b' }}
                                      isAnimationActive={false}
                                    />
                                    <Brush
                                      dataKey="timestampLabel"
                                      height={24}
                                      stroke="#94a3b8"
                                      travellerWidth={8}
                                    />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>

                <Card>
                  <Collapsible defaultOpen={false}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle>Prompt Audit</CardTitle>
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="group"
                            aria-label="Toggle Prompt Audit"
                          >
                            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    </CardHeader>
                    <CollapsibleContent>
                      <CardContent className="space-y-4">
                        {promptAuditLoading ? (
                          <p className="text-sm text-muted-foreground">
                            Loading prompt audit...
                          </p>
                        ) : promptAuditError ? (
                          <p className="text-sm text-destructive">{promptAuditError}</p>
                        ) : (
                          <Tabs defaultValue="messages" className="space-y-3">
                            <TabsList>
                              <TabsTrigger value="messages">Messages</TabsTrigger>
                              <TabsTrigger value="system">System</TabsTrigger>
                            </TabsList>

                            <TabsContent
                              value="messages"
                              className="max-h-[30rem] space-y-4 overflow-y-auto pr-2"
                            >
                              {conversationMessages.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  No user or assistant messages found.
                                </p>
                              ) : (
                                <ol className="space-y-3">
                                  {conversationMessages.map((message) => (
                                    <li
                                      key={message.id}
                                      className="space-y-2 rounded-md border border-border bg-muted/30 p-3"
                                    >
                                      <Badge variant="outline" className="capitalize">
                                        {message.role}
                                      </Badge>
                                      <div className="text-sm whitespace-pre-wrap break-words">
                                        {message.content}
                                      </div>
                                    </li>
                                  ))}
                                </ol>
                              )}

                              {developerMessages.length > 0 ? (
                                <div className="space-y-2 border-t border-border pt-3">
                                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Developer Messages
                                  </p>
                                  <div className="space-y-2">
                                    {developerMessages.map((message) => (
                                      <div
                                        key={message.id}
                                        className="rounded-md border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap break-words"
                                      >
                                        {message.content}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </TabsContent>

                            <TabsContent
                              value="system"
                              className="max-h-[30rem] space-y-3 overflow-y-auto pr-2"
                            >
                              {systemMessages.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  No system messages found.
                                </p>
                              ) : (
                                systemMessages.map((message, index) => (
                                  <div
                                    key={message.id}
                                    className="rounded-md border border-border bg-muted/30 p-3"
                                  >
                                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                      System Message {index + 1}
                                    </p>
                                    <div className="text-sm whitespace-pre-wrap break-words">
                                      {message.content}
                                    </div>
                                  </div>
                                ))
                              )}
                            </TabsContent>
                          </Tabs>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>

                <Card>
                  <Collapsible defaultOpen={false}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle>
                          Requests ({activeSessionGroup.sessionRequestCount})
                        </CardTitle>
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="group"
                            aria-label="Toggle Requests"
                          >
                            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    </CardHeader>
                    <CollapsibleContent>
                      <CardContent className="space-y-3">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Request</TableHead>
                              <TableHead>Timestamp</TableHead>
                              <TableHead className="text-right">Tool Calls</TableHead>
                              <TableHead className="text-right">
                                Total Elapsed Time
                              </TableHead>
                              <TableHead className="text-right">
                                Total Prompt Processing
                              </TableHead>
                              <TableHead className="text-right">Input Tokens</TableHead>
                              <TableHead className="text-right">Output Tokens</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {activeSessionGroup.requests.map((request) => {
                              const isSelected = selectedRequestId === request.sessionId

                              return (
                                <TableRow
                                  key={request.sessionId}
                                  onClick={() => setSelectedRequestId(request.sessionId)}
                                  className="cursor-pointer"
                                  data-state={isSelected ? 'selected' : undefined}
                                >
                                  <TableCell className="font-medium">
                                    {request.sessionId}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {formatTimestamp(
                                      request.requestStartedAt || request.firstSeenAt
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs">
                                    {formatNumber(request.requestToolCallCount)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs">
                                    {formatDurationMs(request.requestElapsedMs)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs">
                                    {formatDurationMs(request.requestPromptProcessingMs)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs">
                                    {formatNumber(request.promptTokens)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs">
                                    {formatNumber(request.completionTokens)}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              </>
            )}
          </main>
        </SidebarInset>
      </div>

      {selectedRequestId ? (
        <button
          type="button"
          aria-label="Close request details"
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setSelectedRequestId(undefined)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-l border-border bg-background shadow-xl transition-transform duration-200 ${
          selectedRequestId ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Request</p>
            <p className="truncate text-sm font-semibold">{selectedRequestId || 'None'}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close request details"
            onClick={() => setSelectedRequestId(undefined)}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-4 p-4">
          {!selectedRequestId ? (
            <div className="text-sm text-muted-foreground">
              Select a request to view request data and timeline.
            </div>
          ) : requestLoading ? (
            <div className="text-sm text-muted-foreground">Loading request...</div>
          ) : requestError ? (
            <div className="text-sm text-destructive">{requestError}</div>
          ) : requestData ? (
            <TimelinePanel
              events={requestData.events}
              request={requestData.request}
              metrics={requestData.metrics}
              toolCalls={requestData.toolCalls}
            />
          ) : (
            <div className="text-sm text-muted-foreground">Request not found.</div>
          )}
        </div>
      </aside>

      {isIndexing ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Indexing Log Files</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Parsing LM Studio logs. Existing sessions stay available while new
              files are indexed.
            </p>
            <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${indexingProgress}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {indexingProgress}% complete ({processedFilesLabel}/{totalFilesLabel}{' '}
              files)
            </div>
            {indexingDetails.currentFile ? (
              <div className="mt-2 truncate text-xs text-muted-foreground">
                {indexingDetails.currentFile}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </SidebarProvider>
  )
}
