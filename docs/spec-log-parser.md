# LMS Log Parser Specification

## 1. Purpose

The parser converts LM Studio server logs into normalized request sessions with:

- request metadata
- timeline events
- aggregated tool calls
- computed metrics

## 2. Pipeline Overview

1. Read log lines (`lib/parser/lineReader.ts`)
2. Reconstruct multiline JSON blocks (`lib/parser/sessionBuilder.ts` + `jsonBlock.ts`)
3. Classify parser events (`lib/parser/events.ts`)
4. Build request-anchored sessions (`lib/parser/sessionBuilder.ts`)
5. Aggregate stream/prompt/tool data
6. Compute metrics (`lib/parser/metrics.ts`)
7. Convert to persisted/indexed `Session` records (`lib/indexer/index.ts`)

## 3. Line Reading

`parseLogLine` supports:

- `[ts][level] message`
- `[ts][level][model] message`

Lines that do not match either pattern are emitted as `isContinuation: true` and
used when combining multiline JSON payloads.

## 4. Event Classification

Current parser events:

- `request_received`
- `prompt_processing`
- `stream_packet`
- `stream_finished`
- `parser_error` (type exists; classification currently returns `null` on parse miss)

Classification notes:

- Request JSON must parse and include `messages[]`
- Packet JSON must parse and include string `id`
- Prompt percent accepts dot/comma decimals

## 5. Session Builder Rules

### 5.1 Request anchoring

- A session is created only when `request_received` is seen
- Non-request events before first request are buffered
- Buffered events are replayed only if `event.ts >= request.ts`

### 5.2 Session finalization

On finalize, parser emits:

- one aggregated `prompt_processing` event (if prompt ticks seen)
- one aggregated `stream_chunk` event (if packets seen)
- optional `stream_finished` event
- all collected tool calls + computed metrics

## 6. Aggregation Details

### 6.1 Prompt processing

Accumulates:

- `eventCount`
- `firstPromptTs`
- `lastPromptTs`
- `lastPercent`
- `elapsedMs`

### 6.2 Stream response

Accumulates:

- `chunkCount`
- `firstChunkTs`
- `lastChunkTs`
- `responseText` (concatenated `delta.content`)
- `elapsedMs`

### 6.3 Tool calls

- Extracted from `choices[].delta.tool_calls[]`
- Merged by `tool_call.id`
- Fallback correlation by `index`
- Final fallback when exactly one active tool call exists
- Stores `argumentsText` and parsed `argumentsJson` (when valid JSON)

## 7. Metrics Computation

From timeline/timing trackers:

- `promptTokens`, `completionTokens`, `totalTokens` from latest `usage`
- `promptProcessingMs` from first to last prompt-progress timestamp
- `streamLatencyMs` from first packet to stream-finished (or last packet fallback)
- `tokensPerSecond` from completion tokens and stream latency

Timestamp parsing accepts:

- `YYYY-MM-DD HH:MM:SS`
- `YYYY-MM-DD HH:MM:SS,mmm`
- `YYYY-MM-DD HH:MM:SS.mmm`

## 8. Indexer Coupling

Indexer behavior relevant to parser output:

- Deterministic `sessionId` from `sha1(sourcePath)` + source ordinal
- Persisted in SQLite with file metadata and checksums
- Incremental parsing of new/changed files
- Latest log file is always reparsed
- Session lookup supports both `sessionId` and `chatId`
- Session groups derived from system/user message checksums

## 9. Error Tolerance

Current resilience behavior:

- malformed/truncated JSON does not crash parse flow
- sessions are skipped only when no request anchor exists
- missing stream-finished still allows latency fallback to last packet
- metrics/durations are clamped to non-negative values where appropriate

## 10. Test Coverage Baseline

Parser/indexer tests currently validate:

- multiline JSON extraction
- tool-call argument merging
- request anchoring and orphan handling
- non-negative duration invariants
- deterministic session IDs across rebuilds
- lookup by `sessionId` and `chatId`
