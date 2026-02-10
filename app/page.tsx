'use client'

import { RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import MetricsPanel from '@/components/session/MetricsPanel'
import TimelinePanel from '@/components/session/TimelinePanel'
import ToolCallsPanel from '@/components/session/ToolCallsPanel'
import SessionsSidebar from '@/components/sessions/SessionsSidebar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ThemeToggle from '@/components/ui/theme-toggle'
import { useSessionDetails } from '@/lib/hooks/useSessionDetails'
import { useSessions } from '@/lib/hooks/useSessions'

export default function Home() {
  const {
    sessions,
    loading: sessionsLoading,
    refresh,
    indexStatus,
    indexingProgress,
  } = useSessions()

  const [selectedSession, setSelectedSession] = useState<string | undefined>(
    sessions[0]?.sessionId
  )

  useEffect(() => {
    if (!selectedSession && sessions.length > 0) {
      const firstSession = sessions[0]
      if (firstSession?.sessionId) {
        setSelectedSession(firstSession.sessionId)
      }
    }
  }, [selectedSession, sessions])

  const { data: sessionData, loading: detailsLoading } = useSessionDetails(
    selectedSession || ''
  )

  const activeSession = useMemo(
    () => sessions.find((session) => session.sessionId === selectedSession),
    [selectedSession, sessions]
  )

  const isLoading = sessionsLoading || (selectedSession && detailsLoading)
  const isIndexing = indexStatus?.state === 'indexing'
  const indexingDetails = indexStatus || {
    processedFiles: 0,
    totalFiles: 0,
    currentFile: undefined,
  }
  const processedFilesLabel = Math.floor(indexingDetails.processedFiles)
  const totalFilesLabel = Math.max(0, Math.floor(indexingDetails.totalFiles))

  if (!activeSession) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <SessionsSidebar
            sessions={sessions}
            selectedSessionId={selectedSession}
            onSelectSession={setSelectedSession}
            onRefresh={refresh}
          />
          <SidebarInset className="bg-background">
            <header className="flex h-16 items-center gap-3 border-b border-border px-4">
              <SidebarTrigger className="-ml-1" />
              <div className="flex flex-1 items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Session</p>
                  <h1 className="text-sm font-semibold sm:text-base">
                    No session selected
                  </h1>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => void refresh()}
                  >
                    {sessionsLoading ? (
                      'Loading...'
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    Refresh
                  </Button>
                  <ThemeToggle />
                </div>
              </div>
            </header>
            <main className="flex-1 space-y-4 p-4">
              <div className="text-center text-muted-foreground">
                Select a session from the sidebar to view details
              </div>
            </main>
          </SidebarInset>
        </div>
        {isIndexing ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
              <h2 className="text-lg font-semibold">Indexing Log Files</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Parsing LM Studio logs. Sessions will appear as indexing
                progresses.
              </p>
              <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${indexingProgress}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {indexingProgress}% complete ({processedFilesLabel}/
                {totalFilesLabel} files)
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

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <SessionsSidebar
          sessions={sessions}
          selectedSessionId={selectedSession}
          onSelectSession={setSelectedSession}
          onRefresh={refresh}
        />

        <SidebarInset className="bg-background">
          <header className="flex h-16 items-center gap-3 border-b border-border px-4">
            <SidebarTrigger className="-ml-1" />
            <div className="flex flex-1 items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Session</p>
                <h1 className="text-sm font-semibold sm:text-base">
                  {selectedSession}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => void refresh()}
                >
                  {isLoading ? 'Loading...' : <RefreshCw className="size-4" />}
                  Refresh
                </Button>
                <ThemeToggle />
              </div>
            </div>
          </header>

          <main className="flex-1 space-y-4 p-4">
            {isLoading ? (
              <div className="text-center text-muted-foreground">
                Loading...
              </div>
            ) : sessionData ? (
              <Tabs defaultValue="timeline" className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
                  <TabsList className="grid w-full max-w-lg grid-cols-3 bg-muted/40 text-foreground">
                    <TabsTrigger value="timeline">Timeline</TabsTrigger>
                    <TabsTrigger value="tool-calls">Tool Calls</TabsTrigger>
                    <TabsTrigger value="metrics">Metrics</TabsTrigger>
                  </TabsList>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {sessionData.model ? (
                      <Badge variant="secondary">{sessionData.model}</Badge>
                    ) : null}
                    {sessionData.metrics.promptTokens !== undefined && (
                      <Badge variant="outline">
                        {sessionData.metrics.promptTokens} Input Tokens
                      </Badge>
                    )}
                    {sessionData.metrics.completionTokens !== undefined && (
                      <Badge variant="outline">
                        {sessionData.metrics.completionTokens} Output Tokens
                      </Badge>
                    )}
                  </div>
                </div>

                <TabsContent value="timeline" className="space-y-4">
                  <TimelinePanel
                    events={sessionData.events}
                    request={sessionData.request}
                  />
                </TabsContent>
                <TabsContent value="tool-calls" className="space-y-4">
                  <ToolCallsPanel toolCalls={sessionData.toolCalls} />
                </TabsContent>
                <TabsContent value="metrics" className="space-y-4">
                  <MetricsPanel metrics={sessionData.metrics} />
                </TabsContent>
              </Tabs>
            ) : null}
          </main>
        </SidebarInset>
      </div>
      {isIndexing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
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
              {indexingProgress}% complete ({processedFilesLabel}/
              {totalFilesLabel} files)
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
