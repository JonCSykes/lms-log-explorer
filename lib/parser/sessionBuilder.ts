import * as crypto from 'node:crypto'

import { type ClientType } from '../../types/types'

import {
  type ParserEvent,
  type PromptProcessingEvent,
  type RequestReceivedEvent,
  type RequestReceivedEventData,
  type StreamPacketEvent,
  classifyLogLine,
  extractToolCalls,
  isGeneratedPacketMessage,
  isRequestLineMessage,
} from './events'
import { type LogLine } from './lineReader'
import { TimingTracker, parseTimestampMs } from './metrics'
import { ToolCallMerger, parseToolCallArguments } from './toolCalls'

export interface SessionData {
  chatId?: string
  model?: string
  client: ClientType
  firstSeenAt: string
  systemMessageChecksum?: string
  userMessageChecksum?: string
  request?: RequestReceivedEvent
  events: TimelineEvent[]
  toolCalls: ToolCallData[]
  metrics: SessionMetrics
}

export interface SessionMetrics {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  promptProcessingMs?: number
  streamLatencyMs?: number
  tokensPerSecond?: number
}

export interface TimelineEvent {
  id: string
  type:
    | 'request'
    | 'prompt_processing'
    | 'stream_chunk'
    | 'tool_call'
    | 'usage'
    | 'stream_finished'
  ts: string
  data?: unknown
}

export interface ToolCallData {
  id: string
  name: string
  argumentsText: string
  argumentsJson?: Record<string, unknown>
  requestedAt?: string
}

interface BuildAsyncOptions {
  onProgress?: (fractionComplete: number) => void
}

interface SessionState {
  chatId?: string
  model?: string
  client: ClientType
  firstSeenAt: string
  systemMessageChecksum?: string
  userMessageChecksum?: string
  request?: RequestReceivedEvent
  events: TimelineEvent[]
  promptAccumulator: PromptAccumulator
  streamAccumulator: StreamAccumulator
  toolCallMerger: ToolCallMerger
  timingTracker: TimingTracker
}

interface PromptAccumulator {
  eventCount: number
  firstPromptTs?: string
  lastPromptTs?: string
  lastPercent?: number
  flushed: boolean
}

interface StreamAccumulator {
  chunkCount: number
  firstChunkTs?: string
  lastChunkTs?: string
  responseParts: string[]
  flushed: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  }

  const sortedEntries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right)
  )

  const serializedEntries = sortedEntries.map(
    ([key, nestedValue]) => `${JSON.stringify(key)}:${stableSerialize(nestedValue)}`
  )

  return `{${serializedEntries.join(',')}}`
}

function checksumForMessage(message: unknown): string | undefined {
  if (!isRecord(message)) {
    return undefined
  }

  return crypto
    .createHash('sha1')
    .update(stableSerialize(message))
    .digest('hex')
}

function extractTextFragments(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractTextFragments(item))
  }

  if (!isRecord(value)) {
    return []
  }

  const fragments: string[] = []
  for (const [key, nestedValue] of Object.entries(value)) {
    if (
      (key === 'text' || key === 'content') &&
      typeof nestedValue === 'string' &&
      nestedValue.length > 0
    ) {
      fragments.push(nestedValue)
      continue
    }

    fragments.push(...extractTextFragments(nestedValue))
  }

  return fragments
}

function detectClientFromSystemMessage(systemMessage: unknown): ClientType {
  if (!isRecord(systemMessage)) {
    return 'Unknown'
  }

  const fragments = extractTextFragments(systemMessage.content)
  const joinedContent = fragments.join('\n')
  if (joinedContent.includes('You are opencode, an interactive CLI tool')) {
    return 'Opencode'
  }
  if (joinedContent.includes('You are Codex')) {
    return 'Codex'
  }
  if (
    joinedContent.includes(
      'The assistant is Claude, created by Anthropic.'
    )
  ) {
    return 'Claude'
  }

  return 'Unknown'
}

function applyRequestMetadata(
  state: SessionState,
  requestData: RequestReceivedEventData
): void {
  const body = requestData.body
  if (typeof body.model === 'string' && !state.model) {
    state.model = body.model
  }

  const messages = body.messages
  if (!Array.isArray(messages)) {
    return
  }

  const firstMessage = messages[0]
  const secondMessage = messages[1]
  if (isRecord(firstMessage) && firstMessage.role === 'system') {
    state.systemMessageChecksum = checksumForMessage(firstMessage)
    state.client = detectClientFromSystemMessage(firstMessage)
  }

  if (isRecord(secondMessage) && secondMessage.role === 'user') {
    state.userMessageChecksum = checksumForMessage(secondMessage)
  }
}

function isJsonEventStart(message: string): boolean {
  return isRequestLineMessage(message) || isGeneratedPacketMessage(message)
}

interface JsonBalanceState {
  braceCount: number
  inString: boolean
  escapeNext: boolean
}

const YIELD_EVERY_LINES = 250

function updateJsonBalance(
  text: string,
  state: JsonBalanceState,
  startIndex: number = 0
): void {
  for (let i = startIndex; i < text.length; i++) {
    const char = text[i]
    if (!char) {
      continue
    }

    if (state.escapeNext) {
      state.escapeNext = false
      continue
    }

    if (char === '\\') {
      state.escapeNext = true
      continue
    }

    if (char === '"') {
      state.inString = !state.inString
      continue
    }

    if (state.inString) {
      continue
    }

    if (char === '{') {
      state.braceCount++
    } else if (char === '}') {
      state.braceCount--
    }
  }
}

function createJsonBalanceState(message: string): JsonBalanceState | null {
  const startIndex = message.indexOf('{')
  if (startIndex === -1) {
    return null
  }

  const state: JsonBalanceState = {
    braceCount: 0,
    inString: false,
    escapeNext: false,
  }

  updateJsonBalance(message, state, startIndex)
  return state
}

function combineMultilineJsonLines(lines: LogLine[]): LogLine[] {
  const combined: LogLine[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) {
      continue
    }

    if (line.isContinuation) {
      // Continuation lines are consumed by the previous JSON start line.
      continue
    }

    if (!isJsonEventStart(line.message)) {
      combined.push(line)
      continue
    }

    let mergedMessage = line.message
    let lastIndex = i

    const state = createJsonBalanceState(mergedMessage)
    if (state && state.braceCount > 0) {
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j]
        if (!nextLine?.isContinuation) {
          break
        }

        mergedMessage += `\n${nextLine.rawLine}`
        lastIndex = j

        updateJsonBalance(nextLine.rawLine, state)
        if (state.braceCount <= 0) {
          break
        }
      }
    }

    combined.push({
      ...line,
      message: mergedMessage,
      rawLine: line.rawLine,
    })

    i = lastIndex
  }

  return combined
}

async function combineMultilineJsonLinesAsync(
  lines: LogLine[],
  options?: BuildAsyncOptions
): Promise<LogLine[]> {
  const combined: LogLine[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) {
      if (i > 0 && i % YIELD_EVERY_LINES === 0) {
        options?.onProgress?.(Math.min(0.5, i / (lines.length * 2)))
        await yieldToEventLoop()
      }
      continue
    }

    if (line.isContinuation) {
      if (i > 0 && i % YIELD_EVERY_LINES === 0) {
        options?.onProgress?.(Math.min(0.5, i / (lines.length * 2)))
        await yieldToEventLoop()
      }
      continue
    }

    if (!isJsonEventStart(line.message)) {
      combined.push(line)
      if (i > 0 && i % YIELD_EVERY_LINES === 0) {
        options?.onProgress?.(Math.min(0.5, i / (lines.length * 2)))
        await yieldToEventLoop()
      }
      continue
    }

    let mergedMessage = line.message
    let lastIndex = i

    const state = createJsonBalanceState(mergedMessage)
    if (state && state.braceCount > 0) {
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j]
        if (!nextLine?.isContinuation) {
          break
        }

        mergedMessage += `\n${nextLine.rawLine}`
        lastIndex = j

        updateJsonBalance(nextLine.rawLine, state)
        if (state.braceCount <= 0) {
          break
        }

        if (j > 0 && j % YIELD_EVERY_LINES === 0) {
          options?.onProgress?.(Math.min(0.5, j / (lines.length * 2)))
          await yieldToEventLoop()
        }
      }
    }

    combined.push({
      ...line,
      message: mergedMessage,
      rawLine: line.rawLine,
    })

    i = lastIndex
    if (i > 0 && i % YIELD_EVERY_LINES === 0) {
      options?.onProgress?.(Math.min(0.5, i / (lines.length * 2)))
      await yieldToEventLoop()
    }
  }

  options?.onProgress?.(0.5)
  return combined
}

export function build(lines: LogLine[]): SessionData[] {
  const sessions: SessionData[] = []
  const logicalLines = combineMultilineJsonLines(lines)
  let currentSession: SessionState | null = null
  const pendingPreRequestEvents: ParserEvent[] = []

  for (const line of logicalLines) {
    const event = classifyLogLine(line)
    if (!event) {
      continue
    }

    currentSession = processEvent(
      event,
      sessions,
      currentSession,
      pendingPreRequestEvents
    )
  }

  if (currentSession) {
    finalizeSession(sessions, currentSession)
  }

  return sessions
}

export async function buildAsync(
  lines: LogLine[],
  options?: BuildAsyncOptions
): Promise<SessionData[]> {
  const sessions: SessionData[] = []
  const logicalLines = await combineMultilineJsonLinesAsync(lines, options)
  let currentSession: SessionState | null = null
  const pendingPreRequestEvents: ParserEvent[] = []

  for (let i = 0; i < logicalLines.length; i++) {
    const line = logicalLines[i]
    if (!line) {
      // no-op
    } else {
      const event = classifyLogLine(line)
      if (event) {
        currentSession = processEvent(
          event,
          sessions,
          currentSession,
          pendingPreRequestEvents
        )
      }
    }

    if (i > 0 && i % YIELD_EVERY_LINES === 0) {
      const parseFraction =
        logicalLines.length > 0
          ? 0.5 + Math.min(0.5, i / (logicalLines.length * 2))
          : 1
      options?.onProgress?.(parseFraction)
      await yieldToEventLoop()
    }
  }

  if (currentSession) {
    finalizeSession(sessions, currentSession)
  }

  options?.onProgress?.(1)
  return sessions
}

function processEvent(
  event: ParserEvent,
  sessions: SessionData[],
  currentSession: SessionState | null,
  pendingPreRequestEvents: ParserEvent[]
): SessionState | null {
  if (event.type === 'request_received') {
    if (currentSession) {
      finalizeSession(sessions, currentSession)
    }

    const requestEvent = event as RequestReceivedEvent
    const nextSession = createSession(requestEvent.ts, requestEvent)
    nextSession.events.push({
      id: `request-${requestEvent.ts}`,
      type: 'request',
      ts: requestEvent.ts,
      data: requestEvent.data,
    })
    replayPendingPreRequestEvents(nextSession, pendingPreRequestEvents)
    return nextSession
  }

  if (!currentSession) {
    pendingPreRequestEvents.push(event)
    return null
  }

  if (!isEventAttachableToCurrentRequest(currentSession, event.ts)) {
    return currentSession
  }

  processNonRequestEvent(currentSession, event)
  return currentSession
}

function replayPendingPreRequestEvents(
  state: SessionState,
  pendingPreRequestEvents: ParserEvent[]
): void {
  for (const pendingEvent of pendingPreRequestEvents) {
    if (!isEventAttachableToCurrentRequest(state, pendingEvent.ts)) {
      continue
    }

    processNonRequestEvent(state, pendingEvent)
  }

  pendingPreRequestEvents.length = 0
}

function processNonRequestEvent(state: SessionState, event: ParserEvent): void {
  if (event.type === 'stream_packet') {
    processStreamPacket(state, event as StreamPacketEvent)
    return
  }

  if (event.type === 'prompt_processing') {
    processPromptProcessing(state, event as PromptProcessingEvent)
    return
  }

  if (event.type === 'stream_finished') {
    flushPromptAccumulator(state)
    flushStreamAccumulator(state)
    state.events.push({
      id: `stream-finished-${event.ts}`,
      type: 'stream_finished',
      ts: event.ts,
    })
    state.timingTracker.recordStreamFinished(event.ts)
  }
}

function createSession(
  firstSeenAt: string,
  request?: RequestReceivedEvent
): SessionState {
  const state: SessionState = {
    chatId: undefined,
    model: undefined,
    client: 'Unknown',
    firstSeenAt,
    systemMessageChecksum: undefined,
    userMessageChecksum: undefined,
    request,
    events: [],
    promptAccumulator: {
      eventCount: 0,
      firstPromptTs: undefined,
      lastPromptTs: undefined,
      lastPercent: undefined,
      flushed: false,
    },
    streamAccumulator: {
      chunkCount: 0,
      firstChunkTs: undefined,
      lastChunkTs: undefined,
      responseParts: [],
      flushed: false,
    },
    toolCallMerger: new ToolCallMerger(),
    timingTracker: new TimingTracker(),
  }

  if (request) {
    applyRequestMetadata(state, request.data)
  }

  return state
}

function finalizeSession(sessions: SessionData[], state: SessionState): void {
  flushPromptAccumulator(state)
  flushStreamAccumulator(state)

  if (!state.request && state.events.length === 0) {
    return
  }

  const toolCalls = state.toolCallMerger.getToolCalls().map((toolCall) => ({
    id: toolCall.id,
    name: toolCall.name || '',
    argumentsText: toolCall.argumentsText,
    argumentsJson: parseToolCallArguments(toolCall.argumentsText) ?? undefined,
    requestedAt: toolCall.firstSeenAt,
  }))

  sessions.push({
    chatId: state.chatId,
    model: state.model,
    client: state.client,
    firstSeenAt: state.firstSeenAt,
    systemMessageChecksum: state.systemMessageChecksum,
    userMessageChecksum: state.userMessageChecksum,
    request: state.request,
    events: state.events,
    toolCalls,
    metrics: computeMetrics(state.timingTracker, state.events),
  })
}

function isEventAttachableToCurrentRequest(
  currentSession: SessionState | null,
  eventTs: string
): currentSession is SessionState {
  if (!currentSession) {
    return false
  }

  if (!currentSession.request) {
    return true
  }

  return parseTimestampMs(eventTs) >= parseTimestampMs(currentSession.request.ts)
}

function processStreamPacket(
  state: SessionState,
  event: StreamPacketEvent
): void {
  const packetData = event.data as
    | { packetId: string; rawJson: string }
    | undefined
  if (!packetData) {
    return
  }

  const packet = parsePacket(packetData.rawJson)
  if (!packet) {
    return
  }

  if (!state.chatId && typeof packet.id === 'string') {
    state.chatId = packet.id
  }

  if (!state.model && typeof packet.model === 'string') {
    state.model = packet.model
  }

  flushPromptAccumulator(state)

  state.streamAccumulator.chunkCount += 1
  state.streamAccumulator.firstChunkTs =
    state.streamAccumulator.firstChunkTs || event.ts
  state.streamAccumulator.lastChunkTs = event.ts

  const content = extractStreamContent(packet)
  if (content.length > 0) {
    state.streamAccumulator.responseParts.push(content)
  }

  const toolCallDeltas = extractToolCalls(packet)
  for (const [index, delta] of toolCallDeltas.entries()) {
    state.toolCallMerger.addDelta(delta, event.ts)
    state.events.push({
      id: `tool-call-${event.ts}-${index + 1}-${state.events.length + 1}`,
      type: 'tool_call',
      ts: event.ts,
      data: delta,
    })
  }

  const usage = extractUsageFromPacket(packet)
  if (usage) {
    state.events.push({
      id: `usage-${event.ts}-${state.events.length + 1}`,
      type: 'usage',
      ts: event.ts,
      data: usage,
    })
  }

  state.timingTracker.recordFirstPacket(event.ts)
  state.timingTracker.recordLastPacket(event.ts)
}

function processPromptProcessing(
  state: SessionState,
  event: PromptProcessingEvent
): void {
  const progressData = event.data as { percent: number } | undefined
  if (!progressData) {
    return
  }

  state.timingTracker.recordPromptProgress(event.ts)
  state.promptAccumulator.eventCount += 1
  state.promptAccumulator.firstPromptTs =
    state.promptAccumulator.firstPromptTs || event.ts
  state.promptAccumulator.lastPromptTs = event.ts
  state.promptAccumulator.lastPercent = progressData.percent
}

function computeMetrics(
  timingTracker: TimingTracker,
  events: TimelineEvent[]
): SessionMetrics {
  let promptTokens: number | undefined
  let completionTokens: number | undefined
  let totalTokens: number | undefined

  for (const event of events) {
    if (event.type !== 'usage' || !event.data) {
      continue
    }

    const usage = event.data as Record<string, unknown>
    if (typeof usage.prompt_tokens === 'number') {
      promptTokens = usage.prompt_tokens
    }
    if (typeof usage.completion_tokens === 'number') {
      completionTokens = usage.completion_tokens
    }
    if (typeof usage.total_tokens === 'number') {
      totalTokens = usage.total_tokens
    }
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    promptProcessingMs: timingTracker.computePromptProcessingMs(),
    streamLatencyMs: timingTracker.computeStreamLatencyMs(),
    tokensPerSecond: timingTracker.computeTokensPerSecond(completionTokens),
  }
}

function parsePacket(rawJson: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(rawJson) as unknown
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function extractUsageFromPacket(packet: Record<string, unknown>):
  | {
      prompt_tokens?: number
      completion_tokens?: number
      total_tokens?: number
    }
  | undefined {
  const usageRaw = packet.usage
  if (!isRecord(usageRaw)) {
    return undefined
  }

  return {
    prompt_tokens:
      typeof usageRaw.prompt_tokens === 'number'
        ? usageRaw.prompt_tokens
        : undefined,
    completion_tokens:
      typeof usageRaw.completion_tokens === 'number'
        ? usageRaw.completion_tokens
        : undefined,
    total_tokens:
      typeof usageRaw.total_tokens === 'number'
        ? usageRaw.total_tokens
        : undefined,
  }
}

function extractStreamContent(packet: Record<string, unknown>): string {
  const choicesRaw = packet.choices
  if (!Array.isArray(choicesRaw)) {
    return ''
  }

  const chunks: string[] = []
  for (const choiceRaw of choicesRaw) {
    if (!isRecord(choiceRaw)) {
      continue
    }

    const deltaRaw = choiceRaw.delta
    if (!isRecord(deltaRaw)) {
      continue
    }

    const contentRaw = deltaRaw.content
    if (typeof contentRaw === 'string' && contentRaw.length > 0) {
      chunks.push(contentRaw)
    }
  }

  return chunks.join('')
}

function flushStreamAccumulator(state: SessionState): void {
  if (state.streamAccumulator.flushed || state.streamAccumulator.chunkCount === 0) {
    return
  }

  const firstChunkTs = state.streamAccumulator.firstChunkTs || state.firstSeenAt
  const lastChunkTs = state.streamAccumulator.lastChunkTs || firstChunkTs
  const elapsedMs = Math.max(0, parseTimestampMs(lastChunkTs) - parseTimestampMs(firstChunkTs))

  state.events.push({
    id: `stream-response-${firstChunkTs}-${state.events.length + 1}`,
    type: 'stream_chunk',
    ts: lastChunkTs,
    data: {
      chunkCount: state.streamAccumulator.chunkCount,
      elapsedMs,
      firstChunkTs,
      lastChunkTs,
      responseText: state.streamAccumulator.responseParts.join(''),
    },
  })

  state.streamAccumulator.flushed = true
}

function flushPromptAccumulator(state: SessionState): void {
  if (state.promptAccumulator.flushed || state.promptAccumulator.eventCount === 0) {
    return
  }

  const firstPromptTs = state.promptAccumulator.firstPromptTs || state.firstSeenAt
  const lastPromptTs = state.promptAccumulator.lastPromptTs || firstPromptTs
  const elapsedMs = Math.max(0, parseTimestampMs(lastPromptTs) - parseTimestampMs(firstPromptTs))

  state.events.push({
    id: `prompt-processing-${firstPromptTs}-${state.events.length + 1}`,
    type: 'prompt_processing',
    ts: lastPromptTs,
    data: {
      eventCount: state.promptAccumulator.eventCount,
      elapsedMs,
      firstPromptTs,
      lastPromptTs,
      lastPercent: state.promptAccumulator.lastPercent,
    },
  })

  state.promptAccumulator.flushed = true
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve)
  })
}
