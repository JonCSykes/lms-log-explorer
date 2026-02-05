"use client"

import { useMemo, useState } from "react"
import { RefreshCw, Settings2 } from "lucide-react"

import MetricsPanel from "@/components/session/MetricsPanel"
import TimelinePanel from "@/components/session/TimelinePanel"
import ToolCallsPanel from "@/components/session/ToolCallsPanel"
import SessionsSidebar from "@/components/sessions/SessionsSidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import ThemeToggle from "@/components/ui/theme-toggle"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

const mockSessions = [
  {
    chatId: "chatcmpl-7pVQk9fF6sZ",
    firstSeenAt: "2024-01-15T10:30:00Z",
    model: "gpt-4o-mini",
    promptTokens: 420,
    completionTokens: 128,
  },
  {
    chatId: "chatcmpl-9XgYp3dE1mK",
    firstSeenAt: "2024-01-15T11:02:14Z",
    model: "gpt-4o",
    promptTokens: 682,
    completionTokens: 244,
  },
  {
    chatId: "chatcmpl-2QnA8kL4tR1",
    firstSeenAt: "2024-01-15T12:47:52Z",
    model: "gpt-4o-mini",
    promptTokens: 188,
    completionTokens: 96,
  },
]

const mockToolCalls = [
  {
    id: "call_abc123",
    name: "search_files",
    argumentsText: '{"pattern":"TODO","path":"/repo"}',
    argumentsJson: { pattern: "TODO", path: "/repo" },
    requestedAt: "2024-01-15T10:30:04Z",
    durationMs: 1280,
  },
  {
    id: "call_def456",
    name: "get_weather",
    argumentsText: '{"location":"NYC","units":"metric"}',
    argumentsJson: { location: "NYC", units: "metric" },
    requestedAt: "2024-01-15T10:30:09Z",
    durationMs: 940,
  },
]

const mockMetrics = {
  promptTokens: 420,
  completionTokens: 128,
  totalTokens: 548,
  streamLatencyMs: 2380,
  tokensPerSecond: 53.8,
  promptProcessingMs: 860,
}

const mockEvents = [
  {
    id: "event-1",
    type: "request" as const,
    ts: "2024-01-15T10:30:00Z",
    data: {
      endpoint: "/v1/chat/completions",
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Find TODOs in the repo." },
      ],
    },
  },
  {
    id: "event-2",
    type: "prompt_progress" as const,
    ts: "2024-01-15T10:30:01Z",
    data: { progress: "50%" },
  },
  {
    id: "event-3",
    type: "tool_call" as const,
    ts: "2024-01-15T10:30:04Z",
    data: {
      id: "call_abc123",
      name: "search_files",
      arguments: { pattern: "TODO", path: "/repo" },
    },
  },
  {
    id: "event-4",
    type: "stream_chunk" as const,
    ts: "2024-01-15T10:30:06Z",
    data: { delta: { content: "Scanning files for TODO markers..." } },
  },
  {
    id: "event-5",
    type: "usage" as const,
    ts: "2024-01-15T10:30:08Z",
    data: { prompt_tokens: 420, completion_tokens: 128, total_tokens: 548 },
  },
  {
    id: "event-6",
    type: "stream_finished" as const,
    ts: "2024-01-15T10:30:09Z",
    data: { reason: "stop" },
  },
]

export default function Home() {
  const [selectedSession, setSelectedSession] = useState<string | undefined>(
    mockSessions[0]?.chatId
  )

  const activeSession = useMemo(
    () => mockSessions.find((session) => session.chatId === selectedSession),
    [selectedSession]
  )

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <SessionsSidebar
          sessions={mockSessions}
          selectedChatId={selectedSession}
          onSelectSession={setSelectedSession}
        />

        <SidebarInset className="bg-background">
          <header className="flex h-16 items-center gap-3 border-b border-border px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="h-6" />
            <div className="flex flex-1 items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Session</p>
                <h1 className="text-sm font-semibold sm:text-base">
                  {activeSession?.chatId ?? "No session selected"}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-2">
                  <RefreshCw className="size-4" />
                  Refresh
                </Button>
                <Button variant="outline" size="sm" className="gap-2">
                  <Settings2 className="size-4" />
                  Settings
                </Button>
                <ThemeToggle />
              </div>
            </div>
          </header>

          <main className="flex-1 space-y-4 p-4">
            {activeSession ? (
              <Tabs defaultValue="timeline" className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
                  <TabsList className="grid w-full max-w-lg grid-cols-3 bg-muted/40 text-foreground">
                    <TabsTrigger value="timeline">Timeline</TabsTrigger>
                    <TabsTrigger value="tool-calls">Tool Calls</TabsTrigger>
                    <TabsTrigger value="metrics">Metrics</TabsTrigger>
                  </TabsList>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {activeSession.model && (
                      <Badge variant="secondary">{activeSession.model}</Badge>
                    )}
                    {activeSession.promptTokens !== undefined && (
                      <Badge variant="outline">
                        {activeSession.promptTokens} prompt
                      </Badge>
                    )}
                    {activeSession.completionTokens !== undefined && (
                      <Badge variant="outline">
                        {activeSession.completionTokens} completion
                      </Badge>
                    )}
                  </div>
                </div>

                <TabsContent value="timeline" className="space-y-4">
                  <TimelinePanel events={mockEvents} />
                </TabsContent>
                <TabsContent value="tool-calls" className="space-y-4">
                  <ToolCallsPanel toolCalls={mockToolCalls} />
                </TabsContent>
                <TabsContent value="metrics" className="space-y-4">
                  <MetricsPanel metrics={mockMetrics} />
                </TabsContent>
              </Tabs>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>No session selected</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Choose a session from the sidebar to explore tool calls,
                  metrics, and the full timeline.
                </CardContent>
              </Card>
            )}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
