'use client'

import { MessageSquare, RefreshCw, Search, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'

interface Session {
  sessionId: string
  chatId?: string
  firstSeenAt: string
  model?: string
}

interface SessionsSidebarProps {
  sessions: Session[]
  selectedSessionId?: string
  onSelectSession: (sessionId: string) => void
  onRefresh?: () => void
}

export default function SessionsSidebar({
  sessions,
  selectedSessionId,
  onSelectSession,
  onRefresh,
}: SessionsSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredSessions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return sessions
    return sessions.filter((session) =>
      session.sessionId.toLowerCase().includes(query)
    )
  }, [searchQuery, sessions])

  const groupedSessions = useMemo(() => {
    const groups = new Map<string, Session[]>()
    for (const session of filteredSessions) {
      const date = new Date(session.firstSeenAt)
      const key = Number.isNaN(date.getTime())
        ? 'Unknown Date'
        : date.toISOString().slice(0, 10)
      const existing = groups.get(key)
      if (existing) {
        existing.push(session)
      } else {
        groups.set(key, [session])
      }
    }

    return [...groups.entries()].map(([dayKey, daySessions]) => ({
      dayKey,
      dayLabel:
        dayKey === 'Unknown Date'
          ? dayKey
          : new Date(`${dayKey}T00:00:00`).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            }),
      sessions: daySessions,
    }))
  }, [filteredSessions])

  const formatTimestamp = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString()
  }

  return (
    <Sidebar collapsible="icon" defaultWidth={352}>
      <SidebarHeader className="gap-3 px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]/sidebar-wrapper:hidden">
            <span className="text-sm font-semibold">LMS Log Explorer</span>
            <span className="text-xs text-muted-foreground">
              Session navigation
            </span>
          </div>
        </div>
        <div className="group-data-[collapsible=icon]/sidebar-wrapper:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center justify-between px-2 group-data-[collapsible=icon]/sidebar-wrapper:hidden">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sessions
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => onRefresh?.()}
              disabled={!onRefresh}
              aria-label="Refresh sessions"
            >
              <RefreshCw className="size-4" />
            </Button>
          </div>
          {filteredSessions.length === 0 ? (
            <div className="px-2 py-6 text-sm text-muted-foreground group-data-[collapsible=icon]/sidebar-wrapper:hidden">
              No sessions found
            </div>
          ) : (
            <div className="space-y-4">
              {groupedSessions.map((group) => (
                <Collapsible key={group.dayKey} defaultOpen={false} className="space-y-2">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="w-full rounded-md px-2 py-1 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-sidebar-accent/40 group-data-[collapsible=icon]/sidebar-wrapper:hidden"
                    >
                      {group.dayLabel}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenu>
                      {group.sessions.map((session) => (
                        <SidebarMenuItem key={session.sessionId}>
                          <SidebarMenuButton
                            isActive={selectedSessionId === session.sessionId}
                            onClick={() => onSelectSession(session.sessionId)}
                            className="px-3 group-data-[collapsible=icon]/sidebar-wrapper:justify-center"
                          >
                            <MessageSquare className="mt-1 size-4 text-muted-foreground" />
                            <div className="flex w-full flex-col gap-1 group-data-[collapsible=icon]/sidebar-wrapper:hidden">
                              <span className="truncate font-medium text-sm text-left">
                                {session.sessionId.startsWith('session-')
                                  ? session.sessionId
                                  : `session-${session.sessionId}`}
                              </span>
                              <span className="text-xs text-muted-foreground whitespace-nowrap text-left">
                                {formatTimestamp(session.firstSeenAt)}
                              </span>
                            </div>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
