import { NextRequest, NextResponse } from 'next/server';
import * as path from 'path';

function getLogRoot(): string {
  const envRoot = process.env.LMS_LOG_ROOT;
  if (envRoot) {
    return expandHome(envRoot);
  }
  const home = process.env.HOME || '';
  return path.join(home, '.lmstudio', 'server-logs');
}

function expandHome(p: string): string {
  if (p.startsWith('~')) {
    const home = process.env.HOME || '';
    return path.join(home, p.slice(1));
  }
  return p;
}

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

    const logRoot = getLogRoot();

    if (!require("fs").existsSync(logRoot)) {
      return NextResponse.json(
        { error: `Log directory not found: ${logRoot}` },
        { status: 404 },
      );
    }

    // Discover month folders
    const fs = require('fs');
    const entries: import("fs").Dirent[] = fs.readdirSync(logRoot, { withFileTypes: true });
    
    const monthFolders = entries
      .filter((e) => e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name))
      .map((e) => e.name)
      .sort()
      .reverse();

    // Find and parse the session
    for (const month of monthFolders) {
      const monthPath = path.join(logRoot, month);

      if (!fs.existsSync(monthPath)) {
        continue;
      }

      const files: import("fs").Dirent[] = fs.readdirSync(monthPath, { withFileTypes: true });

      for (const file of files) {
        if (file.isFile() && file.name.endsWith('.log')) {
          const filePath = path.join(monthPath, file.name);

          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');

            for (const line of lines) {
              // Check for packet with matching chat ID
              const packetMatch = line.match(/"id":"(chatcmpl-[^"]+)"/);
              if (packetMatch && packetMatch[1] === chatId) {
                // Found the session, build response
                const tsMatch = line.match(/^\[([^\]]+)\]/);
                
                // Simple parsing - extract basic info
                const events = [];
                let model: string | undefined;
                
                for (const logLine of lines) {
                  const lineTsMatch = logLine.match(/^\[([^\]]+)\]/);
                  if (!lineTsMatch) continue;
                  
                  const ts = `${lineTsMatch[1]}Z`;
                  
                  // Check for usage data
                  const usageMatch = logLine.match(/"usage":\s*{([^}]+)}/);
                  if (usageMatch) {
                    try {
                      const usage = JSON.parse(`{${usageMatch[1]}}`);
                      events.push({
                        id: 'usage',
                        type: 'usage' as const,
                        ts,
                        data: usage,
                      });
                    } catch (e) {
                      // Skip invalid JSON
                    }
                  }

                  // Check for tool calls
                  if (logLine.includes('tool_calls')) {
                    events.push({
                      id: 'tool_call',
                      type: 'tool_call' as const,
                      ts,
                      data: null,
                    });
                  }

                  // Check for stream finished
                  if (logLine.includes('Finished streaming response')) {
                    events.push({
                      id: 'finished',
                      type: 'stream_finished' as const,
                      ts,
                    });
                  }
                }

                // Determine model from request or first packet
                for (const logLine of lines) {
                  if (logLine.includes('with body')) {
                    const jsonMatch = logLine.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                      try {
                        const body = JSON.parse(jsonMatch[0]);
                        model = body.model;
                        break;
                      } catch (e) {
                        // Skip
                      }
                    }
                  }
                }

                return NextResponse.json({
                  session: {
                    chatId,
                    firstSeenAt: tsMatch ? `${tsMatch[1]}Z` : new Date().toISOString(),
                    model,
                    events,
                    toolCalls: [],
                    metrics: {
                      promptTokens: undefined,
                      completionTokens: undefined,
                      totalTokens: undefined,
                    },
                  },
                });
              }
            }
          } catch (e) {
            console.error(`Failed to read file: ${filePath}`, e);
          }
        }
      }
    }

    return NextResponse.json(
      { error: `Session not found: ${chatId}` },
      { status: 404 },
    );
  } catch (error) {
    console.error('Error fetching session:', error);
    return NextResponse.json(
      { error: 'Failed to fetch session' },
      { status: 500 },
    );
  }
}
