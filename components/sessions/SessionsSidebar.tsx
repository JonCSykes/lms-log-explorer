'use client'

import { MessageSquare, RefreshCw, Search } from 'lucide-react'
import Image from 'next/image'
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
import { getClientIcon } from '@/lib/clientIcons'
import { type ClientType } from '@/types'

interface SessionEntry {
  sessionId: string
  chatId?: string
  firstSeenAt: string
  model?: string
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

interface SessionGroupItem {
  sessionGroupId: string
  sessionName?: string
  sessionStartedAt: string
  sessionModel?: string
  sessionClient: ClientType
  sessionRequestCount: number
}

interface SessionsSidebarProps {
  sessions: SessionEntry[]
  selectedSessionGroupId?: string
  onSelectSessionGroup: (sessionGroupId: string) => void
  onRefresh?: () => void
}

export default function SessionsSidebar({
  sessions,
  selectedSessionGroupId,
  onSelectSessionGroup,
  onRefresh,
}: SessionsSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const sessionGroups = useMemo(() => {
    const byId = new Map<string, SessionGroupItem>()

    for (const session of sessions) {
      const existing = byId.get(session.sessionGroupId)
      if (!existing) {
        byId.set(session.sessionGroupId, {
          sessionGroupId: session.sessionGroupId,
          sessionName: session.sessionName,
          sessionStartedAt: session.sessionStartedAt,
          sessionModel: session.sessionModel,
          sessionClient: session.sessionClient,
          sessionRequestCount: session.sessionRequestCount,
        })
        continue
      }

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
        session.sessionRequestCount
      )
    }

    const query = searchQuery.trim().toLowerCase()
    return [...byId.values()]
      .filter((sessionGroup) => {
        if (!query) {
          return true
        }

        return (
          (sessionGroup.sessionName || '').toLowerCase().includes(query) ||
          sessionGroup.sessionGroupId.toLowerCase().includes(query) ||
          sessionGroup.sessionClient.toLowerCase().includes(query) ||
          (sessionGroup.sessionModel || '').toLowerCase().includes(query)
        )
      })
      .sort(
        (left, right) =>
          new Date(right.sessionStartedAt).getTime() -
          new Date(left.sessionStartedAt).getTime()
      )
  }, [searchQuery, sessions])

  const groupedSessions = useMemo(() => {
    const byDate = new Map<
      string,
      {
        dayKey: string
        dayLabel: string
        sessions: SessionGroupItem[]
      }
    >()

    for (const sessionGroup of sessionGroups) {
      const startDate = new Date(sessionGroup.sessionStartedAt)
      const dayKey = Number.isNaN(startDate.getTime())
        ? 'Unknown Date'
        : startDate.toISOString().slice(0, 10)
      const dayLabel =
        dayKey === 'Unknown Date'
          ? dayKey
          : new Date(`${dayKey}T00:00:00`).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })

      const existing = byDate.get(dayKey)
      if (existing) {
        existing.sessions.push(sessionGroup)
      } else {
        byDate.set(dayKey, {
          dayKey,
          dayLabel,
          sessions: [sessionGroup],
        })
      }
    }

    return [...byDate.values()].sort((left, right) =>
      right.dayKey.localeCompare(left.dayKey)
    )
  }, [sessionGroups])

  const formatTimestamp = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString()
  }

  return (
    <Sidebar collapsible="icon" defaultWidth={352}>
      <SidebarHeader className="gap-3 px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md">
            <Image
              src="/images/lms-log-explorer.svg.png"
              alt="LMS Log Explorer logo"
              width={48}
              height={48}
              className="h-12 w-12 object-contain"
              priority
            />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]/sidebar-wrapper:hidden">
            <span className="text-base font-semibold">LMS Log Explorer</span>
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
          {groupedSessions.length === 0 ? (
            <div className="px-2 py-6 text-sm text-muted-foreground group-data-[collapsible=icon]/sidebar-wrapper:hidden">
              No sessions found
            </div>
          ) : (
            <div className="space-y-4">
              {groupedSessions.map((group) => (
                <Collapsible
                  key={group.dayKey}
                  defaultOpen={false}
                  className="space-y-2"
                >
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
                      {group.sessions.map((sessionGroup) => {
                        const clientIcon = getClientIcon(sessionGroup.sessionClient)
                        const sessionSubtitle = sessionGroup.sessionModel
                          ? `${sessionGroup.sessionModel} • ${sessionGroup.sessionRequestCount} requests`
                          : `${sessionGroup.sessionRequestCount} requests`

                        return (
                          <SidebarMenuItem key={sessionGroup.sessionGroupId}>
                            <SidebarMenuButton
                              isActive={
                                selectedSessionGroupId === sessionGroup.sessionGroupId
                              }
                              onClick={() =>
                                onSelectSessionGroup(sessionGroup.sessionGroupId)
                              }
                              title={sessionGroup.sessionClient}
                              className="px-3 group-data-[collapsible=icon]/sidebar-wrapper:justify-center"
                            >
                              {clientIcon ? (
                                <span
                                  className="mt-1 flex size-7 shrink-0 items-center justify-center"
                                  title={sessionGroup.sessionClient}
                                  aria-label={sessionGroup.sessionClient}
                                >
                                  <Image
                                    src={clientIcon}
                                    alt={`${sessionGroup.sessionClient} client`}
                                    width={24}
                                    height={24}
                                    className="size-6"
                                  />
                                </span>
                              ) : (
                                <span
                                  className="mt-1 flex size-7 shrink-0 items-center justify-center"
                                  title="Unknown"
                                  aria-label="Unknown"
                                >
                                  <MessageSquare
                                    aria-label="Unknown client"
                                    className="size-6 text-muted-foreground"
                                  />
                                </span>
                              )}
                              <div className="flex w-full flex-col gap-1 group-data-[collapsible=icon]/sidebar-wrapper:hidden">
                                <span className="truncate text-left text-sm font-medium">
                                  {sessionGroup.sessionName || sessionGroup.sessionGroupId}
                                </span>
                                <span className="truncate text-left text-xs text-muted-foreground">
                                  {sessionSubtitle}
                                </span>
                                <span className="text-left text-xs whitespace-nowrap text-muted-foreground">
                                  {formatTimestamp(sessionGroup.sessionStartedAt)}
                                </span>
                              </div>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )
                      })}
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
