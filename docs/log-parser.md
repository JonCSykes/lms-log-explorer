# LMS Log Parser Specification

## Overview

This document describes the LM Studio server log format and how our parser processes these logs to extract chat sessions, timeline events, tool calls, and performance metrics.

---

## Log Format

### Line Structure

Each log line follows this format:

```
[YYYY-MM-DD HH:MM:SS][LEVEL] message
```

- **Timestamp**: `[YYYY-MM-DD HH:MM:SS]` - Always the first field
- **Level**: `[INFO]`, `[DEBUG]`, etc. - Log severity level
- **Model Name** (optional): `model_name]` - Only present after server begins processing
- **Message**: The actual log content

**Example lines:**

```log
[2026-02-08 17:59:26][DEBUG] Received request: POST to /v1/chat/completions with body {...}
[2026-02-08 17:59:26][INFO][qwen/qwen3-coder-next] Streaming response...
[2026-02-08 17:59:26][INFO][qwen/qwen3-coder-next] Prompt processing progress: 0.0%
```

---

## Session Lifecycle

A **session** represents a single request and all events from that request until the next request:

```
[Request 1] → [Packets for Request 1]
[Request 2] → [Packets for Request 2]  # New session starts here
```

### Session Lifecycle Stages:

1. **Request Received** - Client sends chat completion request (starts new session)
2. **Stream Starts** - Server acknowledges processing
3. **Prompt Processing** - Server processes the prompt (multiple progress ticks)
4. **Streaming Response** - Server streams response tokens
5. **Stream Finished** - Response completed (or next request arrives)

### Session ID Assignment:

- **Sequential IDs**: `session-001`, `session-002`, etc.
- **Chat ID**: Stored as metadata from first packet's `id` field
- Each request starts a new session, regardless of chatId

---

## Log Message Patterns

### 1. Request Received

**Pattern**: `Received request: POST to /[endpoint] with body {`

**Example:**

```log
[2026-02-08 17:59:26][DEBUG] Received request: POST to /v1/chat/completions with body {
  "model": "qwen/qwen3-coder-next",
  "max_tokens": 32000,
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "Hello"}
  ],
  "tools": [...]
}
```

**What we extract:**

- Timestamp (start of session)
- Model name from request body
- Full messages array (system, user, assistant)
- Tools definition if present

**Note**: This JSON often spans multiple lines. We need multiline JSON extraction.

---

### 2. Streaming Response Started

**Pattern**: `Streaming response...`

**Example:**

```log
[2026-02-08 17:59:26][INFO][qwen/qwen3-coder-next] Streaming response...
```

**What we extract:**

- Timestamp (indicates stream has begun)
- Model name from log prefix

**Note**: This is informational only, but helps timeline visualization.

---

### 3. Prompt Processing Progress

**Pattern**: `Prompt processing progress: X.X%`

**Example**:

```log
[2026-02-08 17:59:26][INFO][qwen/qwen3-coder-next] Prompt processing progress: 0.0%
[2026-02-08 17:59:36][INFO][qwen/qwen3-coder-next] Prompt processing progress: 2.7%
[2026-02-08 17:59:37][INFO][qwen/qwen3-coder-next] Prompt processing progress: 5.5%
```

**What we extract:**

- Progress percentage
- Timestamp for each tick

**Aggregation Strategy (IMPORTANT)**:

- We do NOT show every progress message in the timeline
- Instead, we aggregate by **session** (each request gets its own aggregation group)
- For each prompt processing "group" within a session, we show:
  - First progress message (usually 0%)
  - Last progress message (usually ~100%)
  - Duration = last timestamp - first timestamp

**Why**: A single prompt processing phase can have hundreds of progress ticks. Showing all would overwhelm the UI.

---

### 4. Generated Packet (Streaming Chunk)

**Pattern**: `Generated packet: {`

**Example:**

```log
[2026-02-08 18:00:29][INFO][qwen/qwen3-coder-next] Generated packet: {
  "id": "chatcmpl-35pncf4xh3futbql1zq2o",
  "object": "chat.completion.chunk",
  "created": 1770591629,
  "model": "qwen/qwen3-coder-next",
  "system_fingerprint": "qwen/qwen3-coder-next",
  "choices": [
    {
      "index": 0,
      "delta": {
        "role": "assistant",
        "content": "I"
      },
      "logprobs": null,
      "finish_reason": null
    }
  ]
}
```

**What we extract:**

- **chatId**: From `id` field - This is how we associate packets with sessions
- **Model**: From `model` field (may be null/undefined in early packets)
- **Choices deltas**:
  - `delta.content`: Assistant response text (may be empty, partial, or complete)
  - `delta.tool_calls`: Tool call requests from the model
- **Usage**: From optional `usage` field (prompt_tokens, completion_tokens)

**Aggregation Strategy**:

- We concatenate all `delta.content` chunks in order to reconstruct full assistant response
- For tool_calls, each delta represents a separate tool call request (not aggregated across packets)
- Track first seen timestamp for tool calls

**Note**: This JSON spans multiple lines. We need multiline JSON extraction.

---

### 5. Finished Streaming Response

**Pattern**: `Finished streaming response`

**Example:**

```log
[2026-02-08 18:00:29][INFO][qwen/qwen3-coder-next] Finished streaming response
```

**What we extract:**

- Timestamp (end of stream)

**Importance**: Used to calculate:

- Stream latency = finished timestamp - first packet timestamp
- Tokens per second = completion_tokens / latency_seconds

---

## Token Usage in Packets

Usage information appears in the **last packet** of a stream:

```json
{
  "choices": [
    {
      "delta": {},
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 42,
    "total_tokens": 192
  }
}
```

**Important**: Usage may appear in:

- Last streaming chunk (most common)
- Final "finish" packet

**What we extract:**

- `prompt_tokens`: Input tokens consumed
- `completion_tokens`: Output tokens generated
- `total_tokens`: Sum of both

---

## Tool Calls

Tool calls appear in streaming deltas:

```json
{
  "choices": [
    {
      "delta": {
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "glob",
              "arguments": "{\"pattern\": \"**/*.ts\"}"
            }
          }
        ]
      }
    }
  ]
}
```

**What we extract:**

- `tool_call.id`: Unique identifier
- `function.name`: Tool function name
- `function.arguments`: Argument string (may be partial, we merge across deltas)

**Aggregation Strategy**:

- Multiple deltas can belong to the same tool_call.id
- We accumulate `arguments` strings in order
- Final arguments = concatenated string (attempt to parse as JSON)

**Example of partial arguments across deltas:**

```json
// Delta 1
{"id": "call_abc", "function": {"arguments": "{"}}

// Delta 2
{"id": "call_abc", "function": {"arguments": "\"pattern\""}}

// Delta 3
{"id": "call_abc", "function": {"arguments": ": \"**/*.ts\"}"}}
```

Final aggregated: `{"pattern": "**/*.ts"}`

---

## Session Correlation (Optional)

**Note**: With the new sequential session model, explicit correlation is no longer needed. Each request starts a new session automatically.

For legacy logs or special cases where you want to correlate requests with their responses:

### Old Approach (Deprecated)

Previously, we used timestamp heuristics to link requests to response packets. This is no longer the primary method but may be used for special cases.

**Approach**:

- Maintain a queue of pending requests
- When first packet arrives, find the most recent pending request within window (default 5 seconds)
- Attach request to session based on timestamp proximity

**Benefits of New Approach**:

- Clear 1:1 relationship between requests and sessions
- No heuristics or time-based matching errors
- Simpler mental model and debugging

### When Old Approach Might Still Be Used

If a log file has malformed or incomplete data, the parser may fall back to timestamp-based heuristics for partial recovery. This is an edge case and documented in the parser implementation.

---

## Timeline Event Types

Our parser emits these normalized event types:

| Type              | Description                           | Source Logs                      |
| ----------------- | ------------------------------------- | -------------------------------- |
| `request`         | Client request received               | `Received request: POST...`      |
| `stream_started`  | Server begins streaming               | `Streaming response...`          |
| `prompt_progress` | Prompt processing tick (aggregated)   | `Prompt processing progress: X%` |
| `stream_chunk`    | Assistant response chunk (aggregated) | `Generated packet: {...}`        |
| `tool_call`       | Tool call request                     | `choices[].delta.tool_calls[]`   |
| `usage`           | Token usage summary                   | `packet.usage` in final chunk    |
| `stream_finished` | Stream completion                     | `Finished streaming response`    |

**Note on Aggregation:**

- Some logs generate many individual messages (e.g., 100 prompt progress ticks)
- We aggregate these into single timeline events per logical phase
- This keeps the UI readable while preserving timing information

---

## Multiline JSON Handling

LM Studio logs often split JSON across multiple lines:

```log
[2026-02-08 17:59:26][DEBUG] Received request: POST to /v1/chat/completions with body {
  "model": "qwen/qwen3-coder-next",
  "messages": [
    {"role": "user", "content": "Hello"}
  ]
}
```

**Requirements:**

- Detect start of JSON (`{`)
- Track brace depth to handle nesting
- Handle braces inside string literals (escape sequences)
- Stop when depth returns to 0
- Parse completed JSON block

**Implementation**: Use a brace-balancing state machine that tracks:

1. Current depth
2. Whether we're inside a string
3. Whether last char was escape (`\`)

---

## Performance Metrics Calculation

Per-session metrics are computed as:

```typescript
interface SessionMetrics {
  promptTokens?: number // From usage in final packet
  completionTokens?: number // From usage in final packet
  totalTokens?: number // prompt + completion
  promptProcessingMs?: number // First progress (0%) → first packet
  streamLatencyMs?: number // First packet → finished
  tokensPerSecond?: number // completion_tokens / (latency_seconds)
}
```

**Calculations:**

1. **Prompt Processing Time**

   ```
   timestamp(first progress at 0%) → timestamp(first packet)
   ```

2. **Stream Latency**

   ```
   timestamp(first packet) → timestamp(finished)
   ```

3. **Tokens Per Second**
   ```
   completion_tokens / (stream_latency_seconds)
   ```

**Note**: Some values may be `undefined` if log doesn't contain that information.

---

## Edge Cases & Error Handling

### Malformed JSON

- **Issue**: Partial/incomplete JSON in log
- **Handling**:
  - Try to extract what we can
  - Emit parser_error event (not shown in UI by default)
  - Continue with next log line

### Truncated Logs

- **Issue**: Log file ends mid-session
- **Handling**:
  - Complete session with available data
  - Mark as "incomplete" in metrics
  - Stream latency may be null if no finished line

### Missing Usage Data

- **Issue**: Some packets don't include usage
- **Handling**:
  - Use latest available usage
  - Mark tokens as unknown if none found

### Multiple Sessions Interleaved

- **Issue**: Multiple chat sessions in same log file
- **Handling**:
  - Group by chatId
  - Each chatId gets its own session object
  - Timeline events are ordered by timestamp globally

---

## Parser Architecture

```
Log File
    ↓
Line Reader (reads file line by line)
    ↓
Line Parser (extracts ts, level, message)
    ↓
Event Classifier (identifies log type)
    ↓
Session Builder accumulating events per chatId
    ↓
Tools Aggregator (merge partial arguments)
    ↓
Metrics Calculator (compute derived values)
    ↓
Session Object (complete with events, toolCalls, metrics)
```

---

## Testing Strategy

### Test Fixtures

Located in `fixtures/`:

- `simple-chat.log`: Basic request → response flow
- `multiple-sessions.log`: Two interleaved sessions
- `prompt-progress.log`: Sessions with progress ticks
- `tool-calls.log`: Tool call streaming
- `malformed-json.log`: Edge cases

### Unit Tests

Each parser module has tests:

- `lib/parser/__tests__/jsonBlock.test.ts`
- `lib/parser/__tests__/toolCalls.test.ts`
- `lib/parser/__tests__/sessionLinker.test.ts`
- `lib/parser/__tests__/metrics.test.ts`

---

## Known Limitations

1. **Tool Runtime**: Client-side tool execution isn't logged, so we can only infer timing
2. **Prompt Aggregation**: We show first/last progress, not all ticks (UI simplicity)
3. **No Streaming Parse**: Currently reads entire file into memory before parsing
4. **Single Thread**: Parser runs synchronously (could be parallelized for multiple files)
5. **No File Truncation Detection**: If log is truncated, we don't know it's incomplete

---

## Future Enhancements

1. **Persistent Index**: Store parsed sessions in SQLite for large logs
2. **Streaming Parse**: Process file as it's read (memory efficient)
3. **Client Log Correlation**: Import client logs to get true tool execution times
4. **Error Recovery**: Better parsing recovery for malformed lines
5. **Parallel File Processing**: Build index faster by processing files concurrently
