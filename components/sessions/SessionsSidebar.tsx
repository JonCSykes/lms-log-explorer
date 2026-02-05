"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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
}

export default function SessionsSidebar({
  sessions,
  selectedChatId,
  onSelectSession,
}: SessionsSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  
  const filteredSessions = sessions.filter((s) =>
    s.chatId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-lg font-semibold">Sessions</h2>
        <p className="text-sm text-muted-foreground">
          {sessions.length} sessions found
        </p>
      </div>

      {/* Search */}
      <div className="border-b border-border p-3">
        <Input
          placeholder="Search chat IDs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full"
        />
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto">
        {filteredSessions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No sessions found
          </div>
        ) : (
          <div className="space-y-1">
            {filteredSessions.map((session) => (
              <div
                key={session.chatId}
                onClick={() => onSelectSession(session.chatId)}
                className={`group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-accent ${
                  selectedChatId === session.chatId ? "bg-muted" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {session.chatId}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {new Date(session.firstSeenAt).toLocaleString()}
                    </span>
                    {session.model && (
                      <Badge variant="outline" className="text-[10px]">
                        {session.model}
                      </Badge>
                    )}
                  </div>
                </div>
                
                {/* Tokens badge */}
                {session.promptTokens && session.completionTokens && (
                  <div className="flex items-center gap-1 text-xs font-mono">
                    <span className="text-emerald-500">
                      {session.promptTokens}P
                    </span>
                    <span className="text-blue-500">
                      {session.completionTokens}C
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Refresh button */}
      <div className="border-t border-border p-3">
        <Button variant="outline" className="w-full">
          Refresh
        </Button>
      </div>
    </div>
  );
}
