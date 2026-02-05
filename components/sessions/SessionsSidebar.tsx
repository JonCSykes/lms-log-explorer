"use client"

import { useMemo, useState } from "react"
import { MessageSquare, RefreshCw, Search, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

interface Session {
  chatId: string;
  firstSeenAt: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
}

interface SessionsSidebarProps {
  sessions: Session[];
  selectedChatId?: string;
  onSelectSession: (chatId: string) => void;
  onRefresh?: () => void;
}

export default function SessionsSidebar({
  sessions,
  selectedChatId,
  onSelectSession,
  onRefresh,
}: SessionsSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredSessions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return sessions
    return sessions.filter((session) =>
      session.chatId.toLowerCase().includes(query)
    )
  }, [searchQuery, sessions])

  const formatTimestamp = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString()
  }

  return (
    <Sidebar collapsible="icon">
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
              placeholder="Search chat IDs..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 group-data-[collapsible=icon]/sidebar-wrapper:hidden">
            {filteredSessions.length} sessions
          </SidebarGroupLabel>
          {filteredSessions.length === 0 ? (
            <div className="px-2 py-6 text-sm text-muted-foreground group-data-[collapsible=icon]/sidebar-wrapper:hidden">
              No sessions found
            </div>
          ) : (
            <SidebarMenu>
              {filteredSessions.map((session) => (
                <SidebarMenuItem key={session.chatId}>
                  <SidebarMenuButton
                    isActive={selectedChatId === session.chatId}
                    onClick={() => onSelectSession(session.chatId)}
                    className="items-start gap-3 group-data-[collapsible=icon]/sidebar-wrapper:justify-center"
                  >
                    <MessageSquare className="mt-1 size-4 text-muted-foreground" />
                    <div className="flex w-full flex-col gap-1 group-data-[collapsible=icon]/sidebar-wrapper:hidden">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">
                          {session.chatId}
                        </span>
                        {session.model && (
                          <Badge variant="outline" className="text-[10px]">
                            {session.model}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatTimestamp(session.firstSeenAt)}</span>
                        {session.promptTokens !== undefined &&
                          session.completionTokens !== undefined && (
                            <span className="font-mono text-emerald-600">
                              {session.promptTokens}P /{" "}
                              {session.completionTokens}C
                            </span>
                          )}
                      </div>
                    </div>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          )}
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center gap-2 group-data-[collapsible=icon]/sidebar-wrapper:size-9 group-data-[collapsible=icon]/sidebar-wrapper:p-0"
          onClick={() => onRefresh?.()}
          disabled={!onRefresh}
        >
          <RefreshCw className="size-4" />
          <span className="group-data-[collapsible=icon]/sidebar-wrapper:hidden">
            Refresh sessions
          </span>
        </Button>
        <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]/sidebar-wrapper:hidden">
          Showing {filteredSessions.length} of {sessions.length} sessions
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
