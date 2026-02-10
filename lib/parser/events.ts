import { extractJsonBlock } from './jsonBlock'
import { type LogLine } from './lineReader'

export type ParserEventType =
  | 'request_received'
  | 'prompt_processing'
  | 'stream_packet'
  | 'stream_finished'
  | 'parser_error'

export interface ParserEvent {
  type: ParserEventType
  ts: string
  data?: unknown
  error?: Error
}

export interface RequestReceivedEvent extends ParserEvent {
  type: 'request_received'
  data: {
    method: string
    endpoint: string
    body: Record<string, unknown>
  }
}

export interface PromptProcessingEvent extends ParserEvent {
  type: 'prompt_processing'
  data: {
    percent: number
  }
}

export interface StreamPacketEvent extends ParserEvent {
  type: 'stream_packet'
  data: {
    packetId: string
    rawJson: string
    model?: string
  }
}

export interface StreamFinishedEvent extends ParserEvent {
  type: 'stream_finished'
}

export interface ParserErrorEvent extends ParserEvent {
  type: 'parser_error'
  data: {
    snippet: string
    lineTs: string
  }
}

export interface ToolCallDelta {
  id?: string
  index?: number
  type?: 'function'
  function: {
    name?: string
    arguments?: string
  }
}

interface StreamChoice {
  delta?: {
    role?: 'assistant'
    content?: string
    tool_calls?: Array<Record<string, unknown>>
  }
  index?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function extractToolCalls(
  packet: Record<string, unknown>
): ToolCallDelta[] {
  const choicesRaw = packet.choices
  if (!Array.isArray(choicesRaw)) {
    return []
  }

  const deltas: ToolCallDelta[] = []

  for (const choiceRaw of choicesRaw) {
    const choice = choiceRaw as StreamChoice
    const toolCalls = choice.delta?.tool_calls
    if (!Array.isArray(toolCalls)) {
      continue
    }

    for (const toolCallRaw of toolCalls) {
      if (!isRecord(toolCallRaw)) {
        continue
      }

      const functionRaw = toolCallRaw.function
      const functionData = isRecord(functionRaw) ? functionRaw : {}

      deltas.push({
        id: typeof toolCallRaw.id === 'string' ? toolCallRaw.id : undefined,
        index:
          typeof toolCallRaw.index === 'number' ? toolCallRaw.index : undefined,
        type: toolCallRaw.type === 'function' ? 'function' : undefined,
        function: {
          name:
            typeof functionData.name === 'string'
              ? functionData.name
              : undefined,
          arguments:
            typeof functionData.arguments === 'string'
              ? functionData.arguments
              : undefined,
        },
      })
    }
  }

  return deltas
}

export function classifyLogLine(line: LogLine): ParserEvent | null {
  const message = line.message

  if (
    message.includes('Received request: POST to /v1/chat/completions with body')
  ) {
    const { json } = extractRequestJson(message)
    if (json) {
      return {
        type: 'request_received',
        ts: line.ts,
        data: {
          method: 'POST',
          endpoint: '/v1/chat/completions',
          body: json,
        },
      }
    }
  }

  if (message.includes('Prompt processing progress:')) {
    const percentMatch = /progress:\s*(\d+(?:[.,]\d+)?)%/i.exec(message)
    const percentRaw = percentMatch?.[1]
    if (percentRaw) {
      return {
        type: 'prompt_processing',
        ts: line.ts,
        data: { percent: Number.parseFloat(percentRaw.replace(',', '.')) },
      }
    }
  }

  if (message.includes('Generated packet:')) {
    const { json, raw } = extractJsonBlock(message)
    if (isRecord(json) && typeof json.id === 'string') {
      return {
        type: 'stream_packet',
        ts: line.ts,
        data: {
          packetId: json.id,
          rawJson: raw,
          model: typeof json.model === 'string' ? json.model : undefined,
        },
      }
    }
  }

  if (message.includes('Finished streaming response')) {
    return {
      type: 'stream_finished',
      ts: line.ts,
    }
  }

  return null
}

export function extractRequestJson(message: string): {
  json?: Record<string, unknown>
  raw: string
} {
  const { json, raw } = extractJsonBlock(message)
  if (isRecord(json) && message.includes('with body {')) {
    return { json, raw }
  }

  return { raw }
}
