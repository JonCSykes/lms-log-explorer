import { createReadStream } from 'node:fs'
import * as readline from 'node:readline'

/**
 * Log line with parsed components
 */
export interface LogLine {
  ts: string
  level: string
  modelName?: string
  message: string
  rawLine: string
  isContinuation?: boolean
}

/**
 * Parse standard LM Studio log line format
 * Format: [YYYY-MM-DD HH:MM:SS][LEVEL] message
 * Or:     [YYYY-MM-DD HH:MM:SS][LEVEL][model_name] message
 */
export function parseLogLine(line: string): LogLine | null {
  // Try format with model name: [timestamp][LEVEL][model] message
  let match = /^\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\](.*)$/.exec(line)
  if (match) {
    const [, ts, level, modelName, message] = match
    if (!ts || !level || !modelName || message === undefined) {
      return null
    }

    return {
      ts,
      level: level.trim(),
      modelName: modelName.trim(),
      message: message.trim(),
      rawLine: line,
    }
  }

  // Try format without model name: [timestamp][LEVEL] message
  match = /^\[([^\]]+)\]\[([^\]]+)\](.*)$/.exec(line)
  if (match) {
    const [, ts, level, message] = match
    if (!ts || !level || message === undefined) {
      return null
    }

    return {
      ts,
      level: level.trim(),
      message: message.trim(),
      rawLine: line,
    }
  }

  // Continuation lines are part of multiline JSON payloads.
  if (line.trim().length === 0) {
    return null
  }

  return {
    ts: '',
    level: 'CONTINUATION',
    message: line,
    rawLine: line,
    isContinuation: true,
  }
}

/**
 * Read log file lines using Node streams for memory efficiency
 */
export async function readLogFileLines(filePath: string): Promise<LogLine[]> {
  const lines: LogLine[] = []
  const yieldEvery = 2000

  const fileStream = createReadStream(filePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    const parsed = parseLogLine(line)
    if (parsed) {
      lines.push(parsed)
      if (lines.length % yieldEvery === 0) {
        await new Promise<void>((resolve) => {
          setImmediate(resolve)
        })
      }
    }
  }

  return lines
}

/**
 * Read log file as async generator for streaming processing
 */
export function readLogFileLinesStream(
  filePath: string
): AsyncGenerator<LogLine> {
  return (async function* () {
    const fileStream = createReadStream(filePath, { encoding: 'utf-8' })
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    })

    for await (const line of rl) {
      const parsed = parseLogLine(line)
      if (parsed) {
        yield parsed
      }
    }
  })()
}
