import * as readline from 'readline';
import { createReadStream } from 'fs';

/**
 * Log line with parsed components
 */
export interface LogLine {
  ts: string;
  level: string;
  message: string;
  rawLine: string;
}

/**
 * Parse standard LM Studio log line format
 * Format: [YYYY-MM-DD HH:MM:SS][LEVEL] message
 */
export function parseLogLine(line: string): LogLine | null {
  const match = line.match(/^\[([^\]]+)\]\[([^\]]+)\](.*)$/);
  if (!match) {
    return null;
  }
  
  const [, ts, level, message] = match;
  return {
    ts,
    level: level.trim(),
    message: message.trim(),
    rawLine: line,
  };
}

/**
 * Read log file lines using Node streams for memory efficiency
 */
export async function readLogFileLines(filePath: string): Promise<LogLine[]> {
  const lines: LogLine[] = [];
  
  const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });
  
  for await (const line of rl) {
    const parsed = parseLogLine(line);
    if (parsed) {
      lines.push(parsed);
    }
  }
  
  return lines;
}

/**
 * Read log file as async generator for streaming processing
 */
export function readLogFileLinesStream(
  filePath: string,
): AsyncGenerator<LogLine> {
  return (async function* () {
    const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });
    
    for await (const line of rl) {
      const parsed = parseLogLine(line);
      if (parsed) {
        yield parsed;
      }
    }
  })();
}
