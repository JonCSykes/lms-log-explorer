import { NextRequest, NextResponse } from 'next/server';
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
 * Log file metadata
 */
interface LogFile {
  path: string;
  yearMonth: string;
  filename: string;
}

/**
 * Request query parameters
 */
interface QueryParams {
  q?: string;     // Search query
  limit?: number; // Limit results
  offset?: number; // Offset for pagination
}

/**
 * Sessions list response
 */
interface SessionsListResponse {
  sessions: SessionItem[];
  totalCount?: number;
}

/**
 * Session list item
 */
interface SessionItem {
  chatId: string;
  firstSeenAt: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
}

/**
 * GET /api/sessions - List sessions
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const params: QueryParams = {
      q: url.searchParams.get('q') || undefined,
      limit: parseInt(url.searchParams.get('limit') || '10', 10),
      offset: parseInt(url.searchParams.get('offset') || '0', 10),
    };

    // Get log root directory
    const logRoot = getLogRoot();
    
    if (!require("fs").existsSync(logRoot)) {
      return NextResponse.json({
        sessions: [],
        error: `Log directory not found: ${logRoot}`,
      }, { status: 404 });
    }

    // Read month folders
    const fs = await import('fs');
    const entries = fs.readdirSync(logRoot, { withFileTypes: true });
    
    const monthFolders = entries
      .filter((e) => e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name))
      .map((e) => e.name)
      .sort()
      .reverse();

    // Discover log files and extract sessions
    const allSessions = new Map<string, SessionItem>();
    
    for (const month of monthFolders) {
      const monthPath = path.join(logRoot, month);
      const files = fs.readdirSync(monthPath, { withFileTypes: true });
      
      for (const file of files) {
        if (file.isFile() && file.name.endsWith('.log')) {
          const filePath = path.join(monthPath, file.name);
          
          try {
            // Read and parse log file
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');
            
            for (const line of lines) {
              // Extract chat ID from packets
              const packetMatch = line.match(/"id":"(chatcmpl-[^"]+)"|packet\.id":"(chatcmpl-[^"]+)"/);
              if (packetMatch) {
                const chatId = packetMatch[1] || packetMatch[2];
                
                if (!allSessions.has(chatId)) {
                  // First seen timestamp from line
                  const tsMatch = line.match(/^\[([^\]]+)\]/);
                  allSessions.set(chatId, {
                    chatId,
                    firstSeenAt: tsMatch ? `${tsMatch[1]}Z` : new Date().toISOString(),
                    model: undefined,
                    promptTokens: undefined,
                    completionTokens: undefined,
                  });
                }
              }
            }
          } catch (e) {
            console.error(`Failed to read file: ${filePath}`, e);
          }
        }
      }
    }

    // Convert to array and apply pagination
    const sessions = Array.from(allSessions.values());
    
    // Apply search filter if provided
    let filteredSessions = sessions;
    if (params.q) {
      const queryLower = params.q.toLowerCase();
      filteredSessions = sessions.filter((s) =>
        s.chatId.toLowerCase().includes(queryLower),
      );
    }

    // Apply offset and limit
    const paginatedSessions = filteredSessions.slice(
      params.offset || 0,
      (params.offset || 0) + (params.limit || filteredSessions.length),
    );

    const response: SessionsListResponse = {
      sessions: paginatedSessions,
      totalCount: filteredSessions.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 },
    );
  }
}
