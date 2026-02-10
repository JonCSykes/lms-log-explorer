'use client'

import { ChevronDown } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import JsonViewer from '@/components/ui/json-viewer'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@/components/ui/table'
import { formatDurationMs } from '@/lib/duration'

interface TimelineEvent {
  id: string
  type:
    | 'request'
    | 'prompt_processing'
    | 'stream_chunk'
    | 'tool_call'
    | 'usage'
    | 'stream_finished'
  ts: string
  data?: unknown
}

interface StreamResponseData {
  chunkCount: number
  elapsedMs: number
  firstChunkTs: string
  lastChunkTs: string
  responseText: string
}

interface PromptProcessingData {
  eventCount: number
  elapsedMs: number
  firstPromptTs: string
  lastPromptTs: string
  lastPercent?: number
}

interface TimelinePanelProps {
  events: TimelineEvent[]
  request?: RequestData
}

interface RequestData {
  endpoint: string
  method: string
  body: Record<string, unknown>
}

export default function TimelinePanel({ events, request }: TimelinePanelProps) {
  const formatTime = (ts: string) => {
    const date = new Date(ts)
    if (Number.isNaN(date.getTime())) return ts
    return date.toLocaleString()
  }

  const formatDuration = (start: string, end: string) => {
    const diff = new Date(end).getTime() - new Date(start).getTime()
    if (!Number.isFinite(diff)) {
      return 'Unknown'
    }
    return formatDurationMs(diff)
  }

  const isStreamResponseData = (data: unknown): data is StreamResponseData => {
    if (!data || typeof data !== 'object') {
      return false
    }

    const value = data as Record<string, unknown>
    return (
      typeof value.chunkCount === 'number' &&
      typeof value.elapsedMs === 'number' &&
      typeof value.firstChunkTs === 'string' &&
      typeof value.lastChunkTs === 'string' &&
      typeof value.responseText === 'string'
    )
  }

  const isPromptProcessingData = (
    data: unknown
  ): data is PromptProcessingData => {
    if (!data || typeof data !== 'object') {
      return false
    }

    const value = data as Record<string, unknown>
    return (
      typeof value.eventCount === 'number' &&
      typeof value.elapsedMs === 'number' &&
      typeof value.firstPromptTs === 'string' &&
      typeof value.lastPromptTs === 'string'
    )
  }

  const getEventDuration = (event: TimelineEvent, nextEvent?: TimelineEvent) => {
    if (event.type === 'stream_chunk' && isStreamResponseData(event.data)) {
      return formatDurationMs(event.data.elapsedMs)
    }

    if (
      event.type === 'prompt_processing' &&
      isPromptProcessingData(event.data)
    ) {
      return formatDurationMs(event.data.elapsedMs)
    }

    if (!nextEvent) {
      return undefined
    }

    return formatDuration(event.ts, nextEvent.ts)
  }

  const renderDataTable = (data?: unknown) => {
    if (!data || typeof data !== 'object') {
      return (
        <p className="text-sm text-muted-foreground">
          No structured data available.
        </p>
      )
    }

    return <JsonViewer data={data} maxHeightClassName="max-h-[20rem]" />
  }

  const eventLabels: Record<TimelineEvent['type'], string> = {
    request: 'Request Received',
    prompt_processing: 'Prompt Processing',
    stream_chunk: 'Stream Response',
    tool_call: 'Tool Call Requested',
    usage: 'Usage Summary',
    stream_finished: 'Stream Finished',
  }

  return (
    <div className="space-y-4">
      {request ? (
        <Card>
          <CardHeader>
            <CardTitle>Request Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline">{request.method}</Badge>
              <span className="font-medium">{request.endpoint}</span>
            </div>

            <Table>
              <TableBody>
                <TableRow>
                  <TableHead className="w-1/3">model</TableHead>
                  <TableCell className="font-mono text-xs">
                    {String(request.body.model || 'Unknown')}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableHead className="w-1/3">messages</TableHead>
                  <TableCell className="font-mono text-xs">
                    {Array.isArray(request.body.messages)
                      ? request.body.messages.length
                      : 0}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <Collapsible className="rounded-md border border-border bg-muted">
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="group w-full justify-between"
                >
                  Raw request payload
                  <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3 pb-3">
                <JsonViewer data={request.body} />
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Session Timeline ({events.length} events)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {events.map((event, index) => {
            const nextEvent = events[index + 1]
            const duration = getEventDuration(event, nextEvent)

            return (
              <Collapsible
                key={event.id}
                className="rounded-lg border border-border bg-background"
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="group flex w-full items-start justify-between gap-4 p-4 text-left"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{event.type}</Badge>
                        <span className="text-sm font-semibold">
                          {eventLabels[event.type]}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatTime(event.ts)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {duration ? <span>+{duration}</span> : null}
                      <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-4 pb-4">
                  <div className="grid gap-3">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Details</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {event.type === 'prompt_processing' &&
                        isPromptProcessingData(event.data) ? (
                          <Table>
                            <TableBody>
                              <TableRow>
                                <TableHead className="w-1/3">
                                  Total Progress Events
                                </TableHead>
                                <TableCell className="font-mono text-xs">
                                  {event.data.eventCount}
                                </TableCell>
                              </TableRow>
                              <TableRow>
                                <TableHead className="w-1/3">
                                  Total Elapsed
                                </TableHead>
                                <TableCell className="font-mono text-xs">
                                  {formatDuration(
                                    event.data.firstPromptTs,
                                    event.data.lastPromptTs
                                  )}{' '}
                                  ({formatDurationMs(event.data.elapsedMs)})
                                </TableCell>
                              </TableRow>
                              <TableRow>
                                <TableHead className="w-1/3">
                                  Final Progress
                                </TableHead>
                                <TableCell className="font-mono text-xs">
                                  {event.data.lastPercent !== undefined
                                    ? `${event.data.lastPercent}%`
                                    : 'Unknown'}
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        ) : event.type === 'stream_chunk' &&
                          isStreamResponseData(event.data) ? (
                          <>
                            <Table>
                              <TableBody>
                                <TableRow>
                                  <TableHead className="w-1/3">
                                    Total Chunks
                                  </TableHead>
                                  <TableCell className="font-mono text-xs">
                                    {event.data.chunkCount}
                                  </TableCell>
                                </TableRow>
                                <TableRow>
                                  <TableHead className="w-1/3">
                                    Total Elapsed
                                  </TableHead>
                                  <TableCell className="font-mono text-xs">
                                    {formatDuration(
                                      event.data.firstChunkTs,
                                      event.data.lastChunkTs
                                    )}{' '}
                                    ({formatDurationMs(event.data.elapsedMs)})
                                  </TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">
                                Concatenated Response
                              </p>
                              <pre className="max-h-80 max-w-full overflow-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap break-words">
                                {event.data.responseText || '(empty response)'}
                              </pre>
                            </div>
                          </>
                        ) : (
                          renderDataTable(event.data)
                        )}
                      </CardContent>
                    </Card>
                    <Separator />
                    <Collapsible className="rounded-md border border-border bg-muted">
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="group w-full justify-between"
                        >
                          Raw event payload
                          <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="px-3 pb-3">
                        {event.data === undefined ? (
                          <p className="text-sm text-muted-foreground">
                            No payload available.
                          </p>
                        ) : (
                          <JsonViewer data={event.data} />
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
