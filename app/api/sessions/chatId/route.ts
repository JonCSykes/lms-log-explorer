import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Get log root directory from environment
 */
function getLogRoot(): string {
  const envRoot = process.env.LMS_LOG_ROOT;
  if (envRoot) {
    return expandHome(envRoot);
  }
  const home = process.env.HOME || '';
  return path.join(home, '.lmstudio', 'server-logs');
}

/**
 * Expand ~ to home directory
 */
function expandHome(p: string): string {
  if (p.startsWith('~')) {
    const home = process.env.HOME || '';
    return path.join(home, p.slice(1));
  }
  return p;
}

/**
 * Session response
 */
interface SessionResponse {
  session: SessionItem;
}

/**
 * Session item with full details
 */
interface SessionItem {
  chatId: string;
  firstSeenAt: string;
  model?: string;
  request?: RequestData;
  events: TimelineEvent[];
  toolCalls: ToolCallItem[];
  metrics: SessionMetrics;
}

/**
 * Request data
 */
interface RequestData {
  endpoint: string;
  method: string;
  body: Record<string, unknown>;
}

/**
 * Timeline event
 */
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

/**
 * Tool call item
 */
interface ToolCallItem {
  id: string;
  name: string;
  argumentsText: string;
  argumentsJson?: Record<string, unknown>;
}

/**
 * Session metrics
 */
interface SessionMetrics {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  promptProcessingMs?: number;
  streamLatencyMs?: number;
  tokensPerSecond?: number;
}

/**
 * GET /api/sessions/chatId - Get single session by ID
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const chatId = url.searchParams.get('chatId');

    if (!chatId) {
      return NextResponse.json(
        { error: 'Missing chatId parameter' },
        { status: 400 },
      );
    }

    // Get log root directory
    const logRoot = getLogRoot();

    if (!fs.existsSync(logRoot)) {
      return NextResponse.json(
        { error: `Log directory not found: ${logRoot}` },
        { status: 404 },
      );
    }

    const monthFolders = fs
      .readdirSync(logRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name))
      .map((e) => e.name);

    // Find and parse the session
    const events: TimelineEvent[] = [];
    let firstSeenAt = '';

    for (const month of monthFolders) {
      const monthPath = path.join(logRoot, month);

      if (!fs.existsSync(monthPath)) {
        continue;
      }

      const files = fs.readdirSync(monthPath, { withFileTypes: true });

      for (const file of files) {
        if (file.isFile() && file.name.endsWith('.log')) {
          const filePath = path.join(monthPath, file.name);

          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');

            for (const line of lines) {
              // Extract timestamp
              const tsMatch = line.match(/^\[([^\]]+)\]/);
              if (!tsMatch) continue;

              const timestamp = `${tsMatch[1]}Z`;

              // Check for packet with matching chat ID
              const packetMatch = line.match(/"id":"(chatcmpl-[^"]+)"/);
              if (packetMatch && packetMatch[1] === chatId) {
                if (!firstSeenAt) {
                  firstSeenAt = timestamp;
                }

                // Parse packet JSON
                const jsonMatch = line.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  try {
                    const packet = JSON.parse(jsonMatch[0]);

                    // Extract usage data
                    if (
                      packet.choices?.[0]?.finish_reason === '' &&
                      packet.usage
                    ) {
                      events.push({
                        id: 'usage',
                        type: 'usage' as const,
                        ts: timestamp,
                        data: packet.usage,
                      });
                    }

                    // Extract tool calls if present
                    const choice = packet.choices?.[0];
                    if (choice?.delta?.tool_calls) {
                      for (const toolCall of choice.delta.tool_calls) {
                        events.push({
                          id: toolCall.id,
                          type: 'tool_call' as const,
                          ts: timestamp,
                          data: toolCall,
                        });
                      }
                    }

                    // Check for stream finished
                    if (choice?.finish_reason === 'stop') {
                      events.push({
                        id: 'finished',
                        type: 'stream_finished' as const,
                        ts: timestamp,
                      });
                    }
                  } catch (e) {
                    // Skip invalid JSON
                  }
                }
              }
            }
          } catch (e) {
            console.error(`Failed to read file: ${filePath}`, e);
          }
        }
      }

      // If we found the session, stop searching
      if (events.length > 0) {
        break;
      }
    }

    // Build session response
    if (events.length === 0) {
      return NextResponse.json(
        { error: `Session not found: ${chatId}` },
        { status: 404 },
      );
    }

    const sessionResponse: SessionResponse = {
      session: {
        chatId,
        firstSeenAt: firstSeenAt || new Date().toISOString(),
        model: undefined,
        request: undefined,
        events,
        toolCalls: events
          .filter((e) => e.type === 'tool_call')
          .map((e) => ({
            id: (e.data as { id?: string })?.id || '',
            name: '',
            argumentsText: '',
            argumentsJson: undefined,
          })),
        metrics: {
          promptTokens: undefined,
          completionTokens: undefined,
          totalTokens: undefined,
        },
      },
    };

    return NextResponse.json(sessionResponse);
  } catch (error) {
    // Log error with chatId if available
    console.error('Error fetching session:', error);
    return NextResponse.json(
      { error: 'Failed to fetch session' },
      { status: 500 },
    );
  }
}
