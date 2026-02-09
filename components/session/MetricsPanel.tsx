'use client'

import { ChevronDown } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@/components/ui/table'

interface SessionMetrics {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  promptProcessingMs?: number
  streamLatencyMs?: number
  tokensPerSecond?: number
}

interface MetricsPanelProps {
  metrics: SessionMetrics
}

export default function MetricsPanel({ metrics }: MetricsPanelProps) {
  const formatNumber = (num?: number) => {
    if (num === undefined) return 'Unknown'
    return num.toLocaleString()
  }

  const formatDuration = (ms?: number) => {
    if (ms === undefined) return 'Unknown'
    const seconds = (ms / 1000).toFixed(2)
    return `${seconds}s`
  }

  const formatTokensPerSecond = (tps?: number) => {
    if (tps === undefined) return 'Unknown'
    return tps.toFixed(2)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Collapsible defaultOpen className="rounded-lg border border-border">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="group flex w-full items-center justify-between gap-2 p-4 text-left"
              >
                <div>
                  <div className="text-sm font-semibold">Token Usage</div>
                  <div className="text-xs text-muted-foreground">
                    Input/output totals derived from usage payloads
                  </div>
                </div>
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-4">
              {metrics.promptTokens === undefined &&
              metrics.completionTokens === undefined ? (
                <p className="text-sm text-muted-foreground">
                  No usage data available
                </p>
              ) : (
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableHead className="w-1/3">Prompt Tokens</TableHead>
                      <TableCell>
                        {formatNumber(metrics.promptTokens)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableHead className="w-1/3">Completion Tokens</TableHead>
                      <TableCell>
                        {formatNumber(metrics.completionTokens)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableHead className="w-1/3">Total Tokens</TableHead>
                      <TableCell>{formatNumber(metrics.totalTokens)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CollapsibleContent>
          </Collapsible>

          <Collapsible defaultOpen className="rounded-lg border border-border">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="group flex w-full items-center justify-between gap-2 p-4 text-left"
              >
                <div>
                  <div className="text-sm font-semibold">
                    Timing & Throughput
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Stream latency, tokens/sec, and prompt processing time
                  </div>
                </div>
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-4">
              <Table>
                <TableBody>
                  <TableRow>
                    <TableHead className="w-1/3">Stream Latency</TableHead>
                    <TableCell>
                      {formatDuration(metrics.streamLatencyMs)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-1/3">Tokens / Second</TableHead>
                    <TableCell>
                      {formatTokensPerSecond(metrics.tokensPerSecond)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-1/3">Prompt Processing</TableHead>
                    <TableCell>
                      {formatDuration(metrics.promptProcessingMs)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </div>
  )
}
