"use client";

import { useState } from "react";
import SessionsSidebar from "@/components/sessions/SessionsSidebar";
import SessionTabs, {
  ToolCallsTab,
  MetricsTab,
  TimelineTab,
} from "@/components/session/SessionTabs";
import ToolCallsPanel from "@/components/session/ToolCallsPanel";
import MetricsPanel from "@/components/session/MetricsPanel";
import TimelinePanel from "@/components/session/TimelinePanel";

// Mock session data for development
const mockSessions = [
  {
    chatId: "chatcmpl-abc123",
    firstSeenAt: "2024-01-15T10:30:00Z",
    model: "gpt-4",
    promptTokens: 25,
    completionTokens: 20,
  },
];

const mockToolCalls = [
  {
    id: "call_abc123",
    name: "get_weather",
    argumentsText: '{"location":"NYC"}',
    argumentsJson: { location: "NYC" },
  },
];

const mockMetrics = {
  promptTokens: 25,
  completionTokens: 20,
  totalTokens: 45,
  streamLatencyMs: 1234,
  tokensPerSecond: 16.2,
};

// Mock events with correct type
const mockEvents = [
  {
    id: "event-1",
    type: "request" as const,
    ts: "2024-01-15T10:30:00Z",
    data: {},
  },
  {
    id: "event-2",
    type: "stream_chunk" as const,
    ts: "2024-01-15T10:30:01Z",
    data: {},
  },
];

export default function Home() {
  const [selectedSession, setSelectedSession] = useState<string | undefined>(
    undefined
  );

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-80 border-r border-border bg-sidebar p-2">
        <SessionsSidebar
          sessions={mockSessions}
          selectedChatId={selectedSession}
          onSelectSession={setSelectedSession}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-background p-6">
        {selectedSession ? (
          <SessionTabs>
            <ToolCallsTab>
              <ToolCallsPanel toolCalls={mockToolCalls} />
            </ToolCallsTab>
            <MetricsTab>
              <MetricsPanel metrics={mockMetrics} />
            </MetricsTab>
            <TimelineTab>
              <TimelinePanel events={mockEvents} />
            </TimelineTab>
          </SessionTabs>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <h2 className="text-2xl font-bold">LMS Log Explorer</h2>
            <p className="mt-4">
              Select a session from the sidebar to view details
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
