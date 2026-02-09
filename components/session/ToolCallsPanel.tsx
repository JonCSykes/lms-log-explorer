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
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@/components/ui/table'

interface ToolCall {
  id: string
  name: string
  argumentsText: string
  argumentsJson?: Record<string, unknown>
  requestedAt?: string
  durationMs?: number
}

interface ToolCallsPanelProps {
  toolCalls: ToolCall[]
}

export default function ToolCallsPanel({ toolCalls }: ToolCallsPanelProps) {
  const formatTimestamp = (value?: string) => {
    if (!value) return 'Unknown'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString()
  }

  const formatDuration = (value?: number) => {
    if (value === undefined) return 'Unknown'
    if (value < 1000) return `${value}ms`
    return `${(value / 1000).toFixed(2)}s`
  }

  if (toolCalls.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tool Calls</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No tool calls found</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Tool Calls ({toolCalls.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {toolCalls.map((call) => (
            <Collapsible
              key={call.id}
              className="rounded-lg border border-border bg-background"
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="group flex w-full items-start justify-between gap-4 p-4 text-left"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{call.name}</span>
                      <Badge variant="secondary">Tool Call</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {call.id}
                    </div>
                  </div>
                  <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-4">
                <div className="grid gap-4">
                  <Card className="border-muted bg-muted/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Metadata</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableBody>
                          <TableRow>
                            <TableHead className="w-1/3">Tool ID</TableHead>
                            <TableCell className="font-mono text-xs">
                              {call.id}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableHead>Requested At</TableHead>
                            <TableCell>
                              {formatTimestamp(call.requestedAt)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableHead>Duration</TableHead>
                            <TableCell>
                              {formatDuration(call.durationMs)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Arguments</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {call.argumentsJson ? (
                        <Table>
                          <TableBody>
                            {Object.entries(call.argumentsJson).map(
                              ([key, value]) => (
                                <TableRow key={key}>
                                  <TableHead className="w-1/3 font-medium">
                                    {key}
                                  </TableHead>
                                  <TableCell className="font-mono text-xs">
                                    {typeof value === 'object'
                                      ? JSON.stringify(value, null, 2)
                                      : String(value)}
                                  </TableCell>
                                </TableRow>
                              )
                            )}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                          No structured JSON detected. Raw payload below.
                        </div>
                      )}
                      <Separator />
                      <Collapsible className="rounded-md border border-border">
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="group w-full justify-between"
                          >
                            Raw arguments
                            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-3 pb-3">
                          <pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs">
                            {call.argumentsText || 'No arguments provided.'}
                          </pre>
                        </CollapsibleContent>
                      </Collapsible>
                    </CardContent>
                  </Card>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
