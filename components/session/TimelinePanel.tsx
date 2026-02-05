"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface TimelineEvent {
  id: string;
  type:
    | 'request'
    | 'prompt_progress'
    | 'stream_chunk'
    | 'tool_call'
    | 'usage'
    | 'stream_finished';
  ts: string;
  data?: unknown;
}

interface TimelinePanelProps {
  events: TimelineEvent[];
}

export default function TimelinePanel({ events }: TimelinePanelProps) {
  const formatTime = (ts: string) => {
    return new Date(ts).toLocaleTimeString();
  };

  const formatDuration = (start: string, end: string) => {
    const diff =
      new Date(end).getTime() - new Date(start).getTime();
    if (diff < 1000) return `${diff}ms`;
    return `${(diff / 1000).toFixed(2)}s`;
  };

  const renderEventContent = (event: TimelineEvent) => {
    switch (event.type) {
      case 'request':
        return (
          <div className="mt-2 text-sm">
            <Badge variant="outline">Request</Badge>
          </div>
        );
      case 'prompt_progress':
        return (
          <div className="mt-2 text-sm">
            <Badge variant="secondary">Prompt</Badge>
          </div>
        );
      case 'stream_chunk':
        return (
          <div className="mt-2 text-sm">
            <Badge variant="secondary">Stream</Badge>
          </div>
        );
      case 'tool_call':
        return (
          <div className="mt-2 text-sm">
            <Badge variant="outline">Tool Call</Badge>
          </div>
        );
      case 'usage':
        return (
          <div className="mt-2 text-sm">
            <Badge variant="outline">Usage</Badge>
          </div>
        );
      case 'stream_finished':
        return (
          <div className="mt-2 text-sm">
            <Badge variant="destructive">Finished</Badge>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Session Timeline ({events.length} events)</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {events.map((event, index) => {
              const nextEvent = events[index + 1];
              const duration =
                nextEvent &&
                `${formatDuration(event.ts, nextEvent.ts)}`;

              return (
                <AccordionItem
                  value={`event-${index}`}
                  key={event.id}
                >
                  <AccordionTrigger className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">
                        {event.type.replace('_', ' ').toUpperCase()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatTime(event.ts)}
                      </div>
                    </div>
                    <Badge variant="outline">
                      {event.type}
                    </Badge>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2">
                    {duration && (
                      <div className="text-xs text-muted-foreground">
                        Duration: {duration}
                      </div>
                    )}
                    <div className="mt-2">
                      {renderEventContent(event)}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
