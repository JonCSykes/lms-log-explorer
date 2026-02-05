import { LogLine } from './lineReader';
import { extractJsonBlock } from './jsonBlock';

/**
 * Event types emitted by parser
 */
export type ParserEventType = 
  | 'request_received'
  | 'prompt_progress'
  | 'stream_packet'
  | 'stream_finished'
  | 'parser_error';

/**
 * Event emitted during parsing
 */
export interface ParserEvent {
  type: ParserEventType;
  ts: string; // ISO timestamp
  data?: unknown;
  error?: Error;
}

/**
 * Request received event with body
 */
export interface RequestReceivedEvent extends ParserEvent {
  type: 'request_received';
  data: {
    method: string;
    endpoint: string;
    body: Record<string, unknown>;
  };
}

/**
 * Prompt progress event
 */
export interface PromptProgressEvent extends ParserEvent {
  type: 'prompt_progress';
  data: {
    percent: number;
  };
}

/**
 * Stream packet event with raw JSON
 */
export interface StreamPacketEvent extends ParserEvent {
  type: 'stream_packet';
  data: {
    packetId: string;
    rawJson: string;
  };
}

/**
 * Stream finished event
 */
export interface StreamFinishedEvent extends ParserEvent {
  type: 'stream_finished';
}

/**
 * Parser error event
 */
export interface ParserErrorEvent extends ParserEvent {
  type: 'parser_error';
  data: {
    snippet: string;
    lineTs: string;
  };
}

/**
 * Extract tool call deltas from stream packet
 */
export function extractToolCalls(packet: Record<string, unknown>): ToolCallDelta[] {
  const choices = packet.choices as StreamChoice[] | undefined;
  if (!choices) {
    return [];
  }
  
  const deltas = choices.flatMap((choice) => {
    const delta = choice.delta as DeltaContent | undefined;
    return delta?.tool_calls || [];
  });
  
  return deltas.map((delta) => ({
    id: delta.id,
    type: delta.type as 'function',
    function: {
      name: delta.function?.name,
      arguments: delta.function?.arguments || '',
    },
  }));
}

/**
 * Metadata about a tool call delta
 */
export interface ToolCallDelta {
  id: string;
  type: 'function';
  function: {
    name?: string;
    arguments?: string;
  };
}

/**
 * Stream choice from packet
 */
interface StreamChoice {
  delta: DeltaContent;
  index: number;
}

/**
 * Content delta from stream
 */
interface DeltaContent {
  role?: 'assistant';
  content?: string;
  tool_calls?: ToolCallDelta[];
}

/**
 * Classify a log line and emit appropriate event
 */
export function classifyLogLine(line: LogLine): ParserEvent | null {
  const message = line.message;
  
  // Check for request
  if (message.includes('Received request: POST to /v1/chat/completions with body')) {
    const { json } = extractRequestJson(message);
    if (json) {
      return {
        type: 'request_received',
        ts: line.ts,
        data: {
          method: 'POST',
          endpoint: '/v1/chat/completions',
          body: json,
        },
      };
    }
  }
  
  // Check for prompt progress
  if (message.includes('Prompt processing progress:')) {
    const percentMatch = message.match(/progress:\s*(\d+)%/);
    if (percentMatch) {
      return {
        type: 'prompt_progress',
        ts: line.ts,
        data: { percent: parseInt(percentMatch[1], 10) },
      };
    }
  }
  
  // Check for generated packet
  if (message.includes('Generated packet:')) {
    const { json, raw } = extractJsonBlock(message);
    if (json && typeof json === 'object' && 'id' in json) {
      return {
        type: 'stream_packet',
        ts: line.ts,
        data: {
          packetId: String((json as { id: unknown }).id),
          rawJson: raw,
        },
      };
    }
    // Incomplete JSON - may be valid once more lines arrive
  }
  
  // Check for stream finished
  if (message.includes('Finished streaming response')) {
    return {
      type: 'stream_finished',
      ts: line.ts,
    };
  }
  
  return null;
}

/**
 * Extract JSON from request message
 */
export function extractRequestJson(message: string): { json?: object; raw: string } {
  const { json, raw } = extractJsonBlock(message);
  if (json && message.includes('with body {')) {
    return { json, raw };
  }
  return { raw };
}
