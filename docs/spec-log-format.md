# LM Studio Log Format

## 1. Line Prefix Formats

The parser accepts two structured prefixes:

1. `[YYYY-MM-DD HH:MM:SS][LEVEL] message`
2. `[YYYY-MM-DD HH:MM:SS][LEVEL][model_name] message`

Examples:

```log
[2026-02-08 17:59:26][DEBUG] Received request: POST to /v1/chat/completions with body {...}
[2026-02-08 17:59:26][INFO][qwen/qwen3-coder-next] Prompt processing progress: 0.0%
```

Lines without a prefix are treated as continuation lines for multiline JSON.

## 2. Recognized Message Types

### 2.1 Request received

Pattern:

```text
Received request: POST to /v1/chat/completions with body {
```

Parsed fields:

- `method = POST`
- `endpoint = /v1/chat/completions`
- JSON body (must contain `messages[]` to be accepted)

### 2.2 Prompt processing progress

Pattern includes:

```text
Prompt processing progress: X%
```

Accepted numeric formats:

- `42%`
- `42.5%`
- `42,5%`

### 2.3 Generated packet

Pattern:

```text
Generated packet: {
```

Expected packet JSON fields used by parser:

- `id` (chat id)
- optional `model`
- `choices[].delta.content`
- `choices[].delta.tool_calls[]`
- optional top-level `usage`

### 2.4 Stream finished

Pattern prefix:

```text
Finished streaming response
```

## 3. Multiline JSON Behavior

Request and packet JSON blocks can span multiple lines. The parser:

- detects JSON start at first `{`
- appends continuation lines
- tracks braces with string/escape awareness
- parses when brace balance returns to zero

If parsing fails, the block is skipped without crashing.

## 4. Tool Call Payload Format

Tool call deltas are read from `choices[].delta.tool_calls[]`.

Common shape:

```json
{
  "id": "call_abc",
  "index": 0,
  "type": "function",
  "function": {
    "name": "glob",
    "arguments": "{\"pattern\":\"**/*.ts\"}"
  }
}
```

Streaming behavior handled:

- `function.arguments` may arrive in fragments
- later fragments may omit `id` and use `index`
- merger uses `id`, then `index`, then single-call fallback

## 5. Usage and Metrics Source Fields

Usage metrics are read from packet top-level `usage` when present:

- `prompt_tokens`
- `completion_tokens`
- `total_tokens`

## 6. Session Boundary Semantics in This Project

- A new request session starts only on `Received request...`
- `chatId` is metadata, not the primary session identifier
- Primary id in the app is deterministic `sessionId`
- Parent grouping in UI is based on request-message checksums (`sessionGroupId`)

## 7. Known Variability / Edge Cases

- Truncated JSON payloads
- Missing stream-finished line
- Missing/partial tool-call fields in deltas
- Empty content deltas
- Non-prefixed continuation lines in multiline payloads
