/**
 * LMS Log Explorer Types
 * 
 * Normalized data model for parsing LM Studio server logs
 */

/**
 * Timestamp format: ISO 8601 string (UTC)
 */
export type Timestamp = string;

/**
 * Chat session from LM Studio logs
 */
export interface Session {
  /**
   * Unique identifier (e.g., "chatcmpl-abc123")
   */
  chatId: string;
  
  /**
   * Timestamp of first event in session
   */
  firstSeenAt: Timestamp;
  
  /**
   * Model name (e.g., "gpt-4")
   */
  model?: string;
  
  /**
   * Original request that started session
   */
  request?: RequestEvent;
  
  /**
   * All timeline events in chronological order
   */
  events: TimelineEvent[];
  
  /**
   * Tool calls from this session (aggregated)
   */
  toolCalls: ToolCallEvent[];
  
  /**
   * Computed metrics
   */
  metrics: SessionMetrics;
}

/**
 * Session performance metrics
 */
export interface SessionMetrics {
  /**
   * Number of prompt tokens consumed
   */
  promptTokens?: number;
  
  /**
   * Number of completion tokens generated
   */
  completionTokens?: number;
  
  /**
   * Total tokens (prompt + completion)
   */
  totalTokens?: number;
  
  /**
   * Time spent processing prompt (ms)
   */
  promptProcessingMs?: number;
  
  /**
   * Stream duration (ms)
   */
  streamLatencyMs?: number;
  
  /**
   * Tokens per second
   */
  tokensPerSecond?: number;
}

/**
 * Event types for timeline
 */
export type TimelineEventType = 
  | 'request'
  | 'prompt_progress'
  | 'stream_chunk'
  | 'tool_call'
  | 'usage'
  | 'stream_finished';

/**
 * Base event interface
 */
export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  ts: Timestamp;
}

/**
 * Request received event
 */
export interface RequestEvent extends TimelineEvent {
  type: 'request';
  endpoint: string;
  method: string;
  body: RequestBody;
}

/**
 * Request body with messages
 */
export interface RequestBody {
  model: string;
  messages: Message[];
  stream?: boolean;
  tools?: ToolDefinition[];
}

/**
 * Chat message
 */
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  name?: string;
}

/**
 * Tool definition from request
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Prompt progress event
 */
export interface PromptProgressEvent extends TimelineEvent {
  type: 'prompt_progress';
  percent: number;
}

/**
 * Stream chunk event
 */
export interface StreamChunkEvent extends TimelineEvent {
  type: 'stream_chunk';
  packetId: string;
  content?: string;
  toolCalls?: ToolCallDelta[];
}

/**
 * Tool call delta in stream
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
 * Tool call event (aggregated from deltas)
 */
export interface ToolCallEvent extends TimelineEvent {
  type: 'tool_call';
  toolCallId: string;
  name: string;
  argumentsText: string;
  argumentsJson?: Record<string, unknown>;
}

/**
 * Usage/metrics event
 */
export interface UsageEvent extends TimelineEvent {
  type: 'usage';
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Stream finished event
 */
export interface StreamFinishedEvent extends TimelineEvent {
  type: 'stream_finished';
}

/**
 * Session list item for sidebar
 */
export interface SessionsListItem {
  chatId: string;
  firstSeenAt: Timestamp;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  streamLatencyMs?: number;
}

/**
 * Sessions list API response
 */
export interface SessionsListResponse {
  sessions: SessionsListItem[];
  totalCount?: number;
}

/**
 * Single session API response
 */
export interface SessionResponse {
  session: Session;
}

/**
 * Error response
 */
export interface ErrorResponse {
  error: string;
  code?: string;
}
