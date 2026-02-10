# LM Studio Log Format Specification

This document describes the log format observed in LM Studio server logs.

## Line Structure

Each log line follows this pattern:

    [YYYY-MM-DD HH:MM:SS][LEVEL] message

### Components

- **Timestamp**: `YYYY-MM-DD HH:MM:SS` - ISO-like format (e.g., `[2024-01-15 10:30:00]`)
- **Level**: `[INFO]`, `[WARN]`, `[ERROR]` - Log severity
- **Message**: Free-text content, often containing JSON payloads

## Known Line Types

### 1. Request Receipt

Indicates a new API request has been received:

    [2024-01-15 10:30:00][INFO] Received request: POST to /v1/chat/completions with body { ... }

Contains:

- HTTP method: `POST`
- Endpoint: `/v1/chat/completions`
- Full JSON request body with:
  - `model`: Model name (e.g., "gpt-4")
  - `messages`: Array of message objects
    - Each has `role` (`system`, `user`, `assistant`)
    - Each has `content` string
  - `stream`: Boolean (always true for streaming)
  - Optional `tools` array

### 2. Prompt Processing Progress

Indicates prompt processing progress:

    [2024-01-15 10:30:00][INFO] Prompt processing progress: X%

Contains:

- Percentage value (0, 50, 100)
- Used to calculate prompt processing time

### 3. Generated Packet

Streaming response packet:

    [2024-01-15 10:30:01][INFO] Generated packet: { ... }

Contains:

- Full JSON object with:
  - `id`: Chat ID (e.g., "chatcmpl-abc123")
  - `object`: Always "chat.completion.chunk"
  - `created`: Unix timestamp
  - `model`: Model name
  - `choices[]`: Array of choice objects, each with:
    - `index`: Choice index
    - `delta`: Partial response data containing:
      - `role`: "assistant" (first delta only)
      - `content`: Text chunk (may be empty string)
      - `tool_calls[]`: Tool call objects with:
        - `id`: Tool call ID
        - `type`: "function"
        - `function`:
          - `name`: Tool name
          - `arguments`: Partial/complete arguments JSON string

### 4. Stream Finished

Indicates end of streaming response:

    [2024-01-15 10:30:04][INFO] Finished streaming response

Contains:

- No additional payload
- Used to determine stream end time

## JSON Format Details

### Chat ID

Found in `packet.id` field (e.g., "chatcmpl-abc123")
Used to correlate packets belonging to the same session

### Usage Data

Found in final packet's `choices[].delta` object:
{
"usage": {
"prompt_tokens": 25,
"completion_tokens": 20,
"total_tokens": 45
}
}

### Tool Call Structure

Tool calls appear in `choices[].delta.tool_calls[]`:

{
"tool_calls": [
{
"id": "call_abc123",
"type": "function",
"function": {
"name": "get_weather",
"arguments": "{\"location\":\"NYC\"}"
}
}
]
}

**Important**: Arguments may be split across multiple deltas.
Parser must reassemble by concatenating `arguments` strings in order.

## Session Boundaries

In LM Studio server logs, a **session** represents a single request and all subsequent events until the next request:

```
[Request 1] → [Packets for Request 1]
[Request 2] → [Packets for Request 2]  # New session starts here
```

### Key Characteristics:

- **Session starts**: Every `Received request: POST to /v1/chat/completions` line
- **Session ends**: Right before the next request (or at end of file)
- **Chat ID** appears in response packets but is **not** the session identifier
- Multiple requests may share same chatId if using streaming with continuation

### Session ID Assignment:

The parser assigns sequential session IDs: `session-001`, `session-002`, etc.
Chat IDs from packets are stored as session metadata for tool call correlation.

### Tool Call Scope:

Tools are defined in the request body and appear in `tool_calls` deltas.
Each session includes only the tools from its originating request, not from other requests in the log file.

## Edge Cases

1. **Truncated logs**: Stream may end without "Finished streaming response"
2. **Malformed JSON**: Some packets may have invalid JSON (skip gracefully)
3. **Multiple sessions**: Packets from different chats interleaved in same file
4. **Empty deltas**: Some packets may have empty `content` or `tool_calls`
