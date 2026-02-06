import { NextRequest, NextResponse } from 'next/server';
import * as path from 'path';

interface QueryParams {
  q?: string;
  limit?: number;
  offset?: number;
}

interface SessionItem {
  chatId: string;
  firstSeenAt: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const params: QueryParams = {
      q: url.searchParams.get('q') || undefined,
      limit: parseInt(url.searchParams.get('limit') || '10', 10),
      offset: parseInt(url.searchParams.get('offset') || '0', 10),
    };

    const logRoot = getLogRoot();
    
    if (!require("fs").existsSync(logRoot)) {
      return NextResponse.json({
        sessions: [],
        error: `Log directory not found: ${logRoot}`,
      }, { status: 404 });
    }

    try {
      const fs = require('fs');
      
      // Discover month folders
      const entries: import("fs").Dirent[] = fs.readdirSync(logRoot, { withFileTypes: true });
      
      const monthFolders = entries
        .filter((e) => e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name))
        .map((e) => e.name)
        .sort()
        .reverse();

      const allSessions = new Map<string, SessionItem>();
      
      for (const month of monthFolders) {
        const monthPath = path.join(logRoot, month);
        const files: import("fs").Dirent[] = fs.readdirSync(monthPath, { withFileTypes: true });
        
        for (const file of files) {
          if (file.isFile() && file.name.endsWith('.log')) {
            const filePath = path.join(monthPath, file.name);
            
            try {
              const content = fs.readFileSync(filePath, 'utf-8');
              const lines = content.split('\n');
              
              for (const line of lines) {
                const packetMatch = line.match(/"id":"(chatcmpl-[^"]+)"|packet\.id":"(chatcmpl-[^"]+)"/);
                if (packetMatch) {
                  const chatId = packetMatch[1] || packetMatch[2];
                  
                  if (!allSessions.has(chatId)) {
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
            } catch (err) {
              console.error(`Failed to read file: ${filePath}`, err);
            }
          }
        }
      }

      const sessions = Array.from(allSessions.values());
      
      let filteredSessions = sessions;
      if (params.q) {
        const queryLower = params.q.toLowerCase();
        filteredSessions = sessions.filter((s) =>
          s.chatId.toLowerCase().includes(queryLower),
        );
      }

      const paginatedSessions = filteredSessions.slice(
        params.offset || 0,
        (params.offset || 0) + (params.limit || filteredSessions.length),
      );

      return NextResponse.json({
        sessions: paginatedSessions,
        totalCount: filteredSessions.length,
      });
    } catch (err) {
      console.error('Error fetching sessions:', err);
      return NextResponse.json(
        { error: 'Failed to fetch sessions' },
        { status: 500 },
      );
    }
  } catch (err) {
    console.error('Error fetching sessions:', err);
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 },
    );
  }
}

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
