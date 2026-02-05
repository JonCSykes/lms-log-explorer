"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SessionMetrics {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  promptProcessingMs?: number;
  streamLatencyMs?: number;
  tokensPerSecond?: number;
}

interface MetricsPanelProps {
  metrics: SessionMetrics;
}

export default function MetricsPanel({ metrics }: MetricsPanelProps) {
  const formatNumber = (num?: number) => {
    if (num === undefined || num === null) return "Unknown";
    return num.toLocaleString();
  };

  const formatDuration = (ms?: number) => {
    if (ms === undefined || ms === null) return "Unknown";
    const seconds = (ms / 1000).toFixed(2);
    return `${seconds}s`;
  };

  const formatTokensPerSecond = (tps?: number) => {
    if (tps === undefined || tps === null) return "Unknown";
    return tps.toFixed(2);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.promptTokens === undefined &&
          metrics.completionTokens === undefined ? (
            <p className="text-muted-foreground">
              No usage data available
            </p>
          ) : (
            <Table>
              <TableBody>
                {metrics.promptTokens !== undefined && (
                  <TableRow>
                    <TableHead className="w-1/3">Prompt Tokens</TableHead>
                    <TableCell>{formatNumber(metrics.promptTokens)}</TableCell>
                  </TableRow>
                )}
                {metrics.completionTokens !== undefined && (
                  <TableRow>
                    <TableHead className="w-1/3">
                      Completion Tokens
                    </TableHead>
                    <TableCell>{formatNumber(metrics.completionTokens)}</TableCell>
                  </TableRow>
                )}
                {metrics.totalTokens !== undefined && (
                  <TableRow>
                    <TableHead className="w-1/3">Total Tokens</TableHead>
                    <TableCell>{formatNumber(metrics.totalTokens)}</TableCell>
                  </TableRow>
                )}
                {metrics.streamLatencyMs !== undefined && (
                  <TableRow>
                    <TableHead className="w-1/3">Stream Latency</TableHead>
                    <TableCell>{formatDuration(metrics.streamLatencyMs)}</TableCell>
                  </TableRow>
                )}
                {metrics.tokensPerSecond !== undefined && (
                  <TableRow>
                    <TableHead className="w-1/3">
                      Tokens / Second
                    </TableHead>
                    <TableCell>
                      {formatTokensPerSecond(metrics.tokensPerSecond)}
                    </TableCell>
                  </TableRow>
                )}
                {metrics.promptProcessingMs !== undefined && (
                  <TableRow>
                    <TableHead className="w-1/3">
                      Prompt Processing
                    </TableHead>
                    <TableCell>
                      {formatDuration(metrics.promptProcessingMs)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
