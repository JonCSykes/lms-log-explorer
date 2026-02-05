## LMS Log Dashboard — Product & Technical Spec (v0.1)

A simple, standalone **Next.js + TypeScript** web app that reads **LM Studio server log files** on the local machine (Mac first) and renders a “developer-friendly” dashboard for exploring sessions (“chat ids”), tool calls, metrics, and a full session timeline with prompts/responses.

---

# 1) Goals

## Primary goals
- **Discover sessions quickly:** left nav lists unique **Chat IDs** (grouping key).
- **Understand what happened:** right pane shows:
    1) **Tool Calls** (what tool was requested, payload, timing)
    2) **Performance Metrics** (session-level totals + derived metrics)
    3) **Session Timeline** (high fidelity prompt/response and key events with durations)

## Non-goals (initially)
- Windows support (later).
- Editing logs or sending anything to LM Studio.
- Multi-user auth (assume local/dev use).

---

# 2) Target Users
- Developers running LM Studio locally who want to **audit prompts**, **evaluate tool usage**, and **debug latency / throughput** from the server logs.

---

# 3) Data Source

## Mac log location (v0)
- `~/.lmstudio/server-logs/[yyyy-mm]/[yyyy-mm-dd].#.log`

## In scope (from your sample log)
The logs include repeating patterns such as:
- `Received request: POST to /v1/chat/completions with body { ... }`
- Streaming output packets: `Generated packet: { ... }`
- End of streaming: `Finished streaming response`
- Prompt processing progress: `Prompt processing progress: X%`
- Final streaming chunk includes `"usage": { "prompt_tokens": ..., "completion_tokens": ... }`
- Tool call deltas appear as `"tool_calls": [...]` inside streamed packets

---

# 4) Key Concepts & Definitions

## Session / Chat ID
- **Chat ID** = the `"id"` found in streamed packets, e.g. `chatcmpl-...`
- A “session” is the sequence of events for that Chat ID:
    - request received
    - prompt processing
    - streaming packets
    - usage summary
    - finish streaming

## Tool Call (as observed from logs)
- Tool calls show up in streamed deltas as `delta.tool_calls[]` with:
    - `tool_call.id`
    - `function.name`
    - `function.arguments` (may be empty or partial depending on streaming)

**Important reality check:** LM Studio logs show the model *requesting* tool calls. The actual tool execution likely happens in the client (e.g., your CLI), so true tool runtime might not be directly logged. In v0, tool timing should be **best-effort derived** (details below).

---

# 5) UI/UX Spec

## Layout
**Two-pane layout**
- **Left sidebar**: searchable list of Chat IDs
- **Right content area**: details for selected Chat ID

Use **Tailwind + shadcn/ui only**.

### Left Sidebar
- Header: “Sessions”
- Controls:
    - Search input (filter Chat IDs)
    - Optional date filter (later; v0 can just show newest-first)
- List items:
    - Chat ID (truncated with copy button)
    - Timestamp of first event in session
    - Small badges: model name, token totals (if available)

**Sorting:** newest session first.

---

## Main Page Sections (Right Pane)

### 1) Tool Calls
Each tool call displayed as a **card/accordion row**:

**Fields**
- Tool name (e.g. `glob`)
- Tool call id (e.g. `"id": "602238777"`)
- Tool description (if it exists in the prompt/tool schema captured in logs; otherwise “Unknown”)
- Arguments payload (rendered nicely)
- Timing:
    - **Requested at** timestamp (when first `tool_calls` delta appears)
    - **Inferred duration** (see timing strategy below)
- Raw JSON expand/collapse (for advanced debugging)

**Arguments rendering**
- If JSON parseable → show as a **shadcn Table** (key/value rows)
- If not parseable (empty/partial streaming) → show as code block

**Timing strategy (v0)**
- If tool call appears and later you detect a subsequent request that includes a tool result (role `tool`, matching `tool_call_id`), then:
    - `duration = next_request_timestamp - tool_call_requested_timestamp`
- If not detectable:
    - duration = “Unknown (client-side execution not present in server logs)”

---

### 2) Performance Metrics (Session-level)
Render as a **shadcn Table** with:

- Total Input Tokens (`usage.prompt_tokens`)
- Total Output Tokens (`usage.completion_tokens`)
- Latency (Stream start → finish)
    - `stream_start`: first “Generated packet” timestamp for that chat id
    - `stream_finish`: “Finished streaming response” timestamp for that chat id
- Tokens per Second (Output)
    - `completion_tokens / latency_seconds` (derived)
- Prompt processing time
    - `first_prompt_progress_timestamp (0%) → first_generated_packet_timestamp`
    - If prompt progress isn’t present: “Unknown”

Also include:
- Model name (from request or packet)
- Created timestamp (from packet `created` epoch, optional display)

---

### 3) Session Timeline
A vertical timeline of “events” in chronological order. This is the “truth view”.

**Event types**
- Request Received
    - Show endpoint and a summarized request body
    - Expand to show full messages (system/user/assistant/tool)
- Prompt Processing
    - Show progress milestones and computed duration
- Streaming Started / Streaming Chunks
    - Show assistant output (reconstructed text from deltas if possible)
    - Show tool call requests inline where they occur
- Tool Call Requested
    - Show tool name + args + id
- Usage Summary
    - Show tokens from final chunk usage
- Streaming Finished

**Prompt visibility requirement**
- Display as much of:
    - system prompt
    - user prompt
    - assistant content (streamed deltas)
      as possible, with collapsible sections to avoid overwhelming the UI.

**Durations**
Each timeline node shows:
- Timestamp
- “Time since previous event”
- If it’s a stage (prompt processing, streaming) show stage duration.

**Reconstruction rules**
- Assistant content: concatenate `delta.content` in order for that chat id.
- Tool calls: collect `delta.tool_calls[]` events and display at the moment they occur.
- Request messages: show the `messages[]` array from the “Received request” JSON.

---

# 6) Parsing & Data Model Spec

## Parsing approach
Implement a custom parser that reads `.log` files and emits structured events.

### Step 1 — Line classification
Each log line starts like:
`[YYYY-MM-DD HH:MM:SS][LEVEL]... message`

Classify lines into:
- **REQUEST_LINE**: contains `Received request: POST to /v1/chat/completions with body {`
- **PACKET_LINE**: contains `Generated packet: {`
- **STREAM_FINISH_LINE**: contains `Finished streaming response`
- **PROMPT_PROGRESS_LINE**: contains `Prompt processing progress:`
- **OTHER**: ignore or keep for raw view (optional)

### Step 2 — JSON extraction
Some lines introduce JSON that spans multiple lines. The parser should:
- Detect start of JSON (`{`)
- Accumulate subsequent lines until braces balance to zero
- Then JSON.parse the block

This is needed for:
- request body JSON
- generated packet JSON

### Step 3 — Session grouping
- When parsing a **packet JSON**, extract `packet.id` (chat id) and assign that event to that session.
- When parsing a **request JSON**, you may not have chat id yet. Associate it with the “current pending request” and later link it to the next chat id that appears soon after (heuristic).

**Heuristic linking (v0 practical approach)**
- Maintain a rolling window of “latest request received timestamp + request JSON”
- When first packet for a new chat id appears shortly after, attach that request as the session’s request.

### Step 4 — Derived metrics
Per chat id compute:
- promptTokens, completionTokens from final usage chunk
- promptProcessingTime (progress 0% → first packet timestamp)
- streamLatency (first packet → finish line)
- tokensPerSecond = completionTokens / streamLatency

### Step 5 — Tool calls extraction
From packet deltas:
- `choices[].delta.tool_calls[]` collect:
    - toolCallId, function.name, function.arguments
    - timestamp (line time)
- Merge partial argument strings if multiple deltas append arguments (common in streaming function calling).

---

## Core Types (TypeScript)

### `Session`
- `chatId: string`
- `firstSeenAt: string` (ISO)
- `model?: string`
- `request?: RequestEvent`
- `events: TimelineEvent[]`
- `toolCalls: ToolCallEvent[]`
- `metrics: SessionMetrics`

### `SessionMetrics`
- `promptTokens?: number`
- `completionTokens?: number`
- `totalTokens?: number`
- `promptProcessingMs?: number`
- `streamLatencyMs?: number`
- `tokensPerSecond?: number`

### `TimelineEvent` (union)
- `type: 'request' | 'prompt_progress' | 'stream_chunk' | 'tool_call' | 'usage' | 'stream_finished' | 'info'`
- `ts: string` (ISO)
- `data: ...`

---

# 7) App Architecture

## Next.js structure (App Router)
- `/` → main dashboard page
- API routes (server-only filesystem access):
    - `GET /api/sessions` → list sessions (chat ids + summary)
    - `GET /api/sessions/[chatId]` → full session payload (events + metrics + tool calls)
    - `POST /api/reindex` (optional) → re-scan logs (or do it automatically)

## Filesystem access constraints
- The app needs to read from `~/.lmstudio/server-logs/...`
- This must be done **server-side only** (Node `fs`), never in the browser.

## Indexing strategy (v0)
- On server start, scan the latest month folder (or last N days).
- Parse logs into an in-memory index:
    - `Map<chatId, Session>`
- Cache results; provide “Refresh” button to rescan.

## Performance considerations
- Logs can be large. Use:
    - streaming file read (Node readline)
    - incremental brace-balancing JSON capture
- Optional later: persist index in SQLite.

---

# 8) UI Components (shadcn-only)

Recommended shadcn primitives:
- `Sidebar` pattern (custom layout + `ScrollArea`)
- `Input` (search)
- `Button` (refresh, copy)
- `Card` / `Accordion` (tool calls)
- `Table` (metrics + tool args key/value)
- `Tabs` (optional: Tool Calls / Metrics / Timeline)
- `Badge` (model, token counts)
- `Separator`
- `Collapsible` (raw JSON, full prompts)
- `Code` blocks via `<pre>` styled with Tailwind (still fine; not a component dependency)

---

# 9) MVP Acceptance Criteria

## Session list
- Loads and shows unique chat IDs from logs
- Selecting a chat id updates URL (e.g. `/?session=chatcmpl-...`) and loads details

## Tool Calls
- Displays all tool call requests found in stream deltas
- Shows name + id + arguments (parsed if JSON)
- Shows best-effort duration strategy

## Metrics
- Shows tokens (prompt/completion/total) when usage exists
- Shows stream latency
- Shows tokens/sec derived

## Timeline
- Shows request messages (system + user + assistant if present in request)
- Shows assistant streamed content reconstructed
- Shows tool call events inline
- Shows durations between events

---

# 10) Roadmap (Post-MVP)

1. **Windows support**
    - configurable base path
2. **Folder picker / config UI**
    - allow user to override log directory
3. **Better tool runtime correlation**
    - if client logs exist, allow importing them and correlating
4. **Export**
    - export a session as JSON or markdown report
5. **Full-text search**
    - search within prompts/responses across sessions
6. **Persistent index**
    - SQLite for fast load on huge logs

---

# 11) Repo & Dev Setup (Suggested)

- `next@latest` (App Router) + TypeScript
- Tailwind
- shadcn/ui initialization
- ESLint + Prettier
- Simple config:
    - `LMS_LOG_ROOT` env var (defaults to `~/.lmstudio/server-logs`)