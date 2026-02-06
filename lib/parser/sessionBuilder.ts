import { SessionLinker } from './sessionLinker';
import { ToolCallMerger } from './toolCalls';
import { TimingTracker, UsageTracker } from './metrics';
import { LogLine } from './lineReader';
import { ParserEvent, classifyLogLine, RequestReceivedEvent, StreamPacketEvent } from './events';

/**
 * Aggregated session data
 */
export interface SessionData {
  chatId: string;
  model?: string;
  firstSeenAt: string;
  request?: RequestReceivedEvent;
  events: TimelineEvent[];
  toolCalls: ToolCallData[];
  metrics: SessionMetrics;
}

/**
 * Normalized timeline event (aggregated from parser events)
 */
export interface TimelineEvent {
  id: string;
  type: 'request' | 'prompt_progress' | 'stream_chunk' | 'tool_call' | 'usage' | 'stream_finished';
  ts: string;
  data?: unknown;
}

/**
 * Tool call data with aggregated arguments
 */
export interface ToolCallData {
  id: string;
  name: string;
  argumentsText: string;
  argumentsJson?: Record<string, unknown>;
  requestedAt?: string;
}

/**
 * Session metrics with computed values
 */
export interface SessionMetrics {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  promptProcessingMs?: number;
  streamLatencyMs?: number;
  tokensPerSecond?: number;
}

/**
 * Build a session from parsed parser events
 */
export class SessionBuilder {
  private chatId?: string;
  private model?: string;
  private firstSeenAt = '';
  private requestEvent?: RequestReceivedEvent;
  private timelineEvents: TimelineEvent[] = [];
  private toolCallMerger = new ToolCallMerger();
  private usageTracker = new UsageTracker();
  private timingTracker = new TimingTracker();
  private sessionLinker = new SessionLinker();

  addLine(line: LogLine): void {
    const event = classifyLogLine(line);
    if (!event) return;

    switch (event.type) {
      case 'request_received':
        this.handleRequestReceived(event as RequestReceivedEvent);
        break;
      case 'prompt_progress':
        this.handlePromptProgress(event, line.ts);
        break;
      case 'stream_packet':
        this.handleStreamPacket(event as StreamPacketEvent, line.ts);
        break;
      case 'stream_finished':
        this.handleStreamFinished(line.ts);
        break;
    }
  }

  private handleRequestReceived(event: RequestReceivedEvent): void {
    this.requestEvent = event;
    
    const body = event.data.body as { model?: string };
    if (body.model) {
      this.model = body.model;
    }

    this.sessionLinker.addRequest(event);
  }

  private handlePromptProgress(event: ParserEvent, ts: string): void {
    const percent = (event.data as { percent: number }).percent;
    this.timelineEvents.push({
      id: `prompt-${ts}`,
      type: 'prompt_progress',
      ts,
      data: { percent },
    });

    this.timingTracker.recordPromptProgress(ts);
  }

  private handleStreamPacket(event: StreamPacketEvent, ts: string): void {
    const packetData = event.data;
    const packetId = packetData.packetId;

    if (!this.firstSeenAt) {
      this.firstSeenAt = ts;
    }

    const packetEvent: StreamPacketEvent = {
      type: 'stream_packet',
      ts,
      data: { packetId, rawJson: packetData.rawJson },
    };

    const correlation = this.sessionLinker.linkPacket(packetEvent);
    
    if (!this.chatId) {
      this.chatId = correlation.sessionchatId;
      if (correlation.requestEvent) {
        this.requestEvent = correlation.requestEvent;
      }
    }

    if (packetData.rawJson) {
      try {
        const rawPacket = JSON.parse(packetData.rawJson);

        if (this.model === undefined && rawPacket.model) {
          this.model = rawPacket.model;
        }

        this.usageTracker.update(rawPacket.usage || {});
        this.timingTracker.recordFirstPacket(ts);
        this.timingTracker.recordLastPacket(ts);

        const choice = rawPacket.choices?.[0];
        
        if (choice?.delta?.content) {
          this.timelineEvents.push({
            id: `chunk-${packetId}-${ts}`,
            type: 'stream_chunk',
            ts,
            data: { content: choice.delta.content },
          });
        }

        if (choice?.delta?.tool_calls) {
          for (const delta of choice.delta.tool_calls) {
            this.toolCallMerger.addDelta(delta, ts);

            this.timelineEvents.push({
              id: `tool-${delta.id}`,
              type: 'tool_call',
              ts,
              data: delta,
            });
          }
        }

        if (rawPacket.usage) {
          this.timelineEvents.push({
            id: `usage-${ts}`,
            type: 'usage',
            ts,
            data: rawPacket.usage,
          });
        }

        if (choice?.finish_reason === 'stop') {
          this.timelineEvents.push({
            id: 'stream-finished',
            type: 'stream_finished',
            ts,
          });
        }
      } catch (e) {
        // Skip malformed JSON in packet
      }
    }
  }

  private handleStreamFinished(ts: string): void {
    this.timelineEvents.push({
      id: 'stream-finished',
      type: 'stream_finished',
      ts,
    });
  }

  build(): SessionData | null {
    if (!this.chatId) return null;

    const toolCalls = this.toolCallMerger.getToolCalls().map((tc) => {
      const argumentsJson = parseToolCallArguments(tc.argumentsText);
      return {
        id: tc.id,
        name: tc.name || 'unknown',
        argumentsText: tc.argumentsText,
        argumentsJson: argumentsJson ?? undefined,
        requestedAt: tc.firstSeenAt,
      };
    });

    const metrics = {
      promptTokens: this.usageTracker.getMetrics().promptTokens,
      completionTokens: this.usageTracker.getMetrics().completionTokens,
      totalTokens: this.usageTracker.getMetrics().totalTokens,
      promptProcessingMs: this.timingTracker.computePromptProcessingMs(),
      streamLatencyMs: this.timingTracker.computeStreamLatencyMs(),
      tokensPerSecond: this.timingTracker.computeTokensPerSecond(
        this.usageTracker.getMetrics().completionTokens
      ),
    };

    return {
      chatId: this.chatId,
      model: this.model,
      firstSeenAt: this.firstSeenAt || new Date().toISOString(),
      request: this.requestEvent,
      events: this.timelineEvents,
      toolCalls,
      metrics,
    };
  }
}

function parseToolCallArguments(text: string): Record<string, unknown> | undefined {
  if (!text.trim()) return undefined;
  
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
