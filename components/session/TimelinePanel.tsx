"use client"

import { ChevronDown } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table"

interface TimelineEvent {
  id: string;
  type:
    | 'request'
    | 'prompt_progress'
    | 'stream_chunk'
    | 'tool_call'
    | 'usage'
    | 'stream_finished';
  ts: string;
  data?: unknown;
}

interface TimelinePanelProps {
  events: TimelineEvent[];
}

export default function TimelinePanel({ events }: TimelinePanelProps) {
  const formatTime = (ts: string) => {
    const date = new Date(ts)
    if (Number.isNaN(date.getTime())) return ts
    return date.toLocaleString()
  }

  const formatDuration = (start: string, end: string) => {
    const diff = new Date(end).getTime() - new Date(start).getTime()
    if (diff < 1000) return `${diff}ms`
    return `${(diff / 1000).toFixed(2)}s`
  }

  const formatJson = (data?: unknown) => {
    if (data === undefined) return "No payload available."
    if (typeof data === "string") return data
    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return String(data)
    }
  }

  const renderDataTable = (data?: unknown) => {
    if (!data || typeof data !== "object") {
      return (
        <p className="text-sm text-muted-foreground">
          No structured data available.
        </p>
      )
    }

    const entries = Object.entries(data as Record<string, unknown>)
    if (entries.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          No structured data available.
        </p>
      )
    }

    return (
      <Table>
        <TableBody>
          {entries.map(([key, value]) => (
            <TableRow key={key}>
              <TableHead className="w-1/3">{key}</TableHead>
              <TableCell className="font-mono text-xs">
                {typeof value === "object"
                  ? JSON.stringify(value, null, 2)
                  : String(value)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  const eventLabels: Record<TimelineEvent["type"], string> = {
    request: "Request Received",
    prompt_progress: "Prompt Progress",
    stream_chunk: "Stream Chunk",
    tool_call: "Tool Call Requested",
    usage: "Usage Summary",
    stream_finished: "Stream Finished",
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Session Timeline ({events.length} events)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {events.map((event, index) => {
            const nextEvent = events[index + 1]
            const duration = nextEvent
              ? formatDuration(event.ts, nextEvent.ts)
              : undefined

            return (
              <Collapsible
                key={event.id}
                defaultOpen
                className="rounded-lg border border-border"
              >
                <CollapsibleTrigger asChild>
                  <button className="group flex w-full items-start justify-between gap-4 p-4 text-left">
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
                      {duration && <span>+{duration}</span>}
                      <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-4 pb-4">
                  <div className="grid gap-3">
                    <Card className="border-muted bg-muted/30">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Details</CardTitle>
                      </CardHeader>
                      <CardContent>{renderDataTable(event.data)}</CardContent>
                    </Card>
                    <Separator />
                    <Collapsible className="rounded-md border border-border">
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
                        <pre className="max-h-80 overflow-auto rounded bg-muted p-3 text-xs">
                          {formatJson(event.data)}
                        </pre>
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
