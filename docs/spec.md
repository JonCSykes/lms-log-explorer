# LMS Log Explorer Product Specification

## 1. Purpose

LMS Log Explorer is a local-first web application for understanding what happened
inside LM Studio chat-completion runs. The product transforms raw server logs
into a structured investigation workspace where developers can inspect prompts,
responses, tool calls, and performance signals.

The core promise is operational clarity: when a run is slow, incorrect, or
surprising, users can quickly identify what request was sent, what events
occurred, and where time and tokens were spent.

## 2. Target Users and Jobs

Primary users are developers running LM Studio locally.

Primary jobs:

- find the exact request behind a behavior regression
- audit prompt and message context
- inspect tool-call arguments and sequence
- compare token/latency patterns across related requests
- confirm indexing progress and data freshness

## 3. Product Scope

LMS Log Explorer reads LM Studio logs from local disk, parses those logs into
structured entities, persists an index in local SQLite, and serves a web UI for
exploration.

In scope:

- log discovery from `LMS_LOG_ROOT`
- request/session reconstruction
- timeline and tool-call visibility
- request and session-group metrics
- searchable session navigation
- server API for status/list/detail/settings
- optional AI-powered session naming

Out of scope:

- mutating LM Studio logs
- multi-user access control and tenanting
- centralized remote log ingestion service

## 4. End-to-End Behavior

1. The app discovers LM Studio log files by month/day naming conventions.
2. The parser classifies lines and reconstructs multiline JSON payloads.
3. Request sessions are formed with timeline events, tool calls, and metrics.
4. Sessions are grouped by prompt identity into parent session groups.
5. Indexed records are persisted to SQLite for fast reload and incremental refresh.
6. The UI renders session groups, request summaries, and request-level detail.
7. Background indexing updates progress while preserving UI responsiveness.

## 5. Domain Schema

This section defines the product’s conceptual data schema and includes concrete
examples that mirror API/UI contracts.

### 5.1 Entity: Session Group

A session group represents related requests that share deterministic prompt
identity (derived from message checksums).

Core fields:

- `sessionGroupId`
- `sessionGroupKey`
- `sessionName` (optional display label)
- `sessionStartedAt`
- `sessionModel`
- `sessionClient`
- aggregate metrics and request count

Example:

```json
{
  "sessionGroupId": "session-group-3a9f8d2e4b01",
  "sessionGroupKey": "1c67...f2a:be42...77d",
  "sessionName": "Refactor parser event flow",
  "sessionStartedAt": "2026-02-12T16:21:04.000Z",
  "sessionModel": "qwen/qwen3-coder-next",
  "sessionClient": "Codex",
  "sessionRequestCount": 4,
  "sessionTotalInputTokens": 7824,
  "sessionTotalOutputTokens": 2410,
  "sessionAverageTokensPerSecond": 38.7,
  "sessionTotalPromptProcessingMs": 18600
}
```

### 5.2 Entity: Request Session

A request session is the unit opened in the request drawer and timeline.

Core fields:

- `sessionId` (deterministic id)
- optional `chatId`
- `firstSeenAt`
- `request`
- `events[]`
- `toolCalls[]`
- `metrics`

Example:

```json
{
  "sessionId": "session-7dcb0f8a4e21-0003",
  "chatId": "chatcmpl-35pncf4xh3futbql1zq2o",
  "firstSeenAt": "2026-02-12T16:21:04.000Z",
  "sessionGroupId": "session-group-3a9f8d2e4b01",
  "client": "Codex",
  "request": {
    "id": "request-2026-02-12T16:21:04.000Z",
    "type": "request",
    "ts": "2026-02-12T16:21:04.000Z",
    "method": "POST",
    "endpoint": "/v1/chat/completions",
    "body": {
      "model": "qwen/qwen3-coder-next",
      "messages": [
        { "role": "system", "content": "You are Codex" },
        { "role": "user", "content": "Review parser logic" }
      ]
    }
  },
  "metrics": {
    "promptTokens": 1200,
    "completionTokens": 420,
    "totalTokens": 1620,
    "promptProcessingMs": 3400,
    "streamLatencyMs": 10800,
    "tokensPerSecond": 38.9
  }
}
```

### 5.3 Entity: Timeline Event

Timeline events are normalized and timestamped. The event stream is chronological.

Event types:

- `request`
- `prompt_processing`
- `stream_chunk`
- `tool_call`
- `usage`
- `stream_finished`

Example event sequence:

```json
[
  {
    "id": "request-2026-02-12T16:21:04.000Z",
    "type": "request",
    "ts": "2026-02-12T16:21:04.000Z"
  },
  {
    "id": "prompt-processing-2026-02-12T16:21:07.000Z-9",
    "type": "prompt_processing",
    "ts": "2026-02-12T16:21:09.000Z",
    "data": {
      "eventCount": 9,
      "elapsedMs": 2000,
      "firstPromptTs": "2026-02-12T16:21:07.000Z",
      "lastPromptTs": "2026-02-12T16:21:09.000Z",
      "lastPercent": 100
    }
  },
  {
    "id": "stream-response-2026-02-12T16:21:10.000Z-1",
    "type": "stream_chunk",
    "ts": "2026-02-12T16:21:20.000Z",
    "data": {
      "chunkCount": 214,
      "elapsedMs": 10000,
      "firstChunkTs": "2026-02-12T16:21:10.000Z",
      "lastChunkTs": "2026-02-12T16:21:20.000Z",
      "responseText": "I reviewed the parser and found..."
    }
  },
  {
    "id": "usage-2026-02-12T16:21:20.000Z-4",
    "type": "usage",
    "ts": "2026-02-12T16:21:20.000Z",
    "data": {
      "prompt_tokens": 1200,
      "completion_tokens": 420,
      "total_tokens": 1620
    }
  }
]
```

### 5.4 Entity: Tool Call

Tool calls are merged from streaming deltas and exposed as request-level records.

Example:

```json
{
  "id": "call_abc123",
  "type": "tool_call",
  "ts": "2026-02-12T16:21:14.000Z",
  "toolCallId": "call_abc123",
  "name": "glob",
  "argumentsText": "{\"pattern\":\"**/*.ts\"}",
  "argumentsJson": {
    "pattern": "**/*.ts"
  }
}
```

### 5.5 Entity: Session List Item

Session list items are optimized for sidebar/main-table rendering.

Example:

```json
{
  "sessionId": "session-7dcb0f8a4e21-0003",
  "chatId": "chatcmpl-35pncf4xh3futbql1zq2o",
  "firstSeenAt": "2026-02-12T16:21:04.000Z",
  "requestStartedAt": "2026-02-12T16:21:04.000Z",
  "requestEndedAt": "2026-02-12T16:21:20.000Z",
  "requestElapsedMs": 16000,
  "requestPromptProcessingMs": 2000,
  "requestToolCallCount": 1,
  "requestTokensPerSecond": 38.9,
  "promptTokens": 1200,
  "completionTokens": 420,
  "streamLatencyMs": 10800,
  "sessionGroupId": "session-group-3a9f8d2e4b01",
  "sessionName": "Refactor parser event flow"
}
```

## 6. Functional Requirements

### 6.1 Log Ingestion and Indexing

The system must:

- resolve `LMS_LOG_ROOT` with home-path expansion
- discover month/day `.log` files in LM Studio folder layout
- perform incremental indexing using file metadata + checksums
- always reparse the latest log file to capture append-only writes
- persist sessions, file metadata, and naming/settings metadata in SQLite
- expose indexing state: `idle`, `indexing`, `ready`, `error`

### 6.2 Parsing and Correlation

The parser must:

- accept both `[ts][level]` and `[ts][level][model]` line prefixes
- treat non-prefixed lines as continuation lines when reconstructing JSON
- parse multiline request and packet JSON with brace/string/escape handling
- anchor session creation on request events
- aggregate prompt progress and stream chunks for readable timelines
- merge tool-call argument fragments by id/index fallback rules
- preserve recoverable data when malformed/truncated JSON is encountered

### 6.3 Metrics and Derivations

The system must compute and expose:

- token metrics: `promptTokens`, `completionTokens`, `totalTokens`
- timing metrics: `promptProcessingMs`, `streamLatencyMs`, `requestElapsedMs`
- throughput metric: `tokensPerSecond`
- request-level convenience summaries for list/table surfaces

Missing values remain unset rather than estimated from unsupported assumptions.

## 7. API Surface

### 7.1 Index and Status

- `GET /api/index` returns readiness + indexing status
- `POST /api/index` schedules rebuild (`?force=1` supported)

Example status payload:

```json
{
  "ready": true,
  "sessionCount": 2767,
  "status": {
    "state": "ready",
    "totalFiles": 31,
    "processedFiles": 31,
    "sessionsIndexed": 2767
  }
}
```

### 7.2 Session Data

- `GET /api/sessions` returns paginated session list (`limit`, `offset`, `q`)
- `GET /api/sessions/chatId` returns request-session detail by `sessionId` or `chatId`

Example list response shape:

```json
{
  "sessions": [{ "sessionId": "session-...", "sessionGroupId": "session-group-..." }],
  "totalCount": 2767,
  "status": { "state": "ready" }
}
```

### 7.3 Settings and Renaming

- `GET/POST /api/settings` for AI session renamer configuration
- `POST /api/session-renamer/run` for explicit rename execution

### 7.4 Debug

- `GET /api/debug/index` provides diagnostic summary when `DEBUG=true`

## 8. UI/UX by Screen

### 8.1 Screen: Session Workspace (`/`)

Purpose:

- provide the default investigation workspace

Structure:

- left: sessions sidebar
- top header: selected session title, settings, refresh, theme toggle
- main: Session Overview, Stats, Prompt Audit, Requests

Primary interactions:

- select a session group
- refresh index
- expand/collapse content cards

### 8.2 Screen: Sessions Sidebar (left navigation)

Purpose:

- fast navigation across session groups

Structure:

- branding header
- search input
- date-grouped collapsible sections
- session-group buttons with client icon, subtitle, timestamp

Interaction details:

- search filters by name/group/client/model
- date groups are collapsible
- selecting a row loads that session group in main content

### 8.3 Screen: Session Overview Card

Purpose:

- summarize high-level behavior of the selected session group

Content:

- client and model
- request count
- total input/output tokens
- average tokens per second
- prompt processing, elapsed time, idle time, and agent work time

UX behavior:

- collapsible panel
- intended for quick triage before opening request-level details

### 8.4 Screen: Stats Card

Purpose:

- visualize request-level trends within a session group

Content:

- line chart for tokens/second and total tokens over time
- tooltip and brush range selection

UX behavior:

- collapsible panel
- displays guidance when chart data is insufficient

### 8.5 Screen: Prompt Audit Card

Purpose:

- inspect message context used by the model

Content:

- tabbed views: `Messages` and `System`
- Messages includes ordered user/assistant flow and developer messages block
- System includes one or more system message entries

UX behavior:

- collapsible card, closed by default
- long content remains scrollable/readable

### 8.6 Screen: Requests Card

Purpose:

- list all requests in the selected session group

Content columns:

- request id
- timestamp
- tool call count
- total elapsed time
- total prompt processing time
- input tokens
- output tokens

UX behavior:

- row click opens request drawer
- requests are ordered chronologically

### 8.7 Screen: Request Drawer (right slide-out)

Purpose:

- provide focused request-level inspection without leaving session context

Sections:

- Request Data card
- Tool Calls (collapsible, nested payload expansion)
- Request Timeline (event cards with details + raw payload)

UX behavior:

- overlay + slide-in interaction
- close via close control or backdrop
- maintains context of selected session group underneath

### 8.8 Screen: Settings (`/settings`)

Purpose:

- configure optional AI session naming behavior

Content:

- enable/disable toggle
- provider selector
- model selector
- API token override controls
- save action

UX behavior:

- token-source awareness (env vs override)
- safe defaults when unset

### 8.9 Cross-Screen States

The UI must handle and communicate:

- loading state (initial and per-request)
- indexing-in-progress state with progress overlay
- empty/no-results state
- recoverable fetch/parsing error state with visible feedback

## 9. Configuration

Core:

- `LMS_LOG_ROOT`
- `LMS_INDEX_DB_PATH`
- `DEBUG`

Optional provider tokens:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY` or `GOOGLE_API_KEY`

## 10. Non-Functional Requirements

### 10.1 Reliability

- parsing errors degrade gracefully without process crashes
- indexing failures surface actionable status to clients

### 10.2 Performance

- indexing supports large local log sets without full-memory loading
- UI remains interactive while indexing runs

### 10.3 Security and Privacy

- filesystem access is server-side only
- external calls occur only for optional AI renaming
- secrets are environment/config managed

### 10.4 Observability

- status/progress is queryable through API
- debug summary endpoint is explicitly gated by `DEBUG=true`

## 11. Acceptance Criteria

The product is acceptable when users can:

- load and search session groups from local LM Studio logs
- inspect request details, timeline, and tool-call payloads
- review token/latency metrics at request and session-group level
- refresh/reindex while preserving a usable UI
- configure and run optional session naming when credentials are available
