# LMS Log Dashboard — Roadmap (Detailed)

This roadmap breaks the project into small, parallelizable work items suitable for multiple agents. Each phase ends with clear deliverables and acceptance checks.

Last updated: 2026-02-12

---

## 0) Project Setup & Conventions - ✅ COMPLETED

### 0.1 Repo bootstrap

**Tasks**

- ✅ Create Next.js App Router project (TypeScript)
- ✅ Install Tailwind CSS
- ✅ Install and initialize shadcn/ui
- ✅ Add ESLint + Prettier config (minimal, consistent)
- ✅ Add basic folder structure:
  - `app/`
  - `app/api/`
  - `components/`
  - `lib/`
  - `lib/parser/`
  - `lib/indexer/`
  - `types/`
  - `styles/`

**Deliverables**

- ✅ Running app with a simple home page
- ⏳ shadcn components imported and usable (shadcn CLI initialized)

**Acceptance**

- ✅ `pnpm dev` starts cleanly
- ✅ Tailwind styles apply
- ⏳ shadcn Button renders (components in `/components/ui/`)

### 0.2 Config + environment - ✅ COMPLETED

**Tasks**

- ✅ Support env var `LMS_LOG_ROOT` (default: `~/.lmstudio/server-logs`)
- ✅ Expand `~` to home directory on server
- ✅ Add a server-side helper: `lib/config.ts`

**Deliverables**

- ✅ `getLogRoot()` returns an absolute path
- ⏳ Clear runtime error when path does not exist (needs error handling)

**Acceptance**

- ✅ App loads and logs show resolved log root

---

## 1) Log Format Recon & Sample Fixtures - ✅ COMPLETED

### 1.1 Build fixtures from sample logs - ✅ COMPLETED

**Tasks**

- ✅ Add `fixtures/` (not committed if too large; keep small representative snippets)
- ✅ Create 3–5 small fixture log files covering:
  - simple chat completion with streaming
  - tool call (with partial arguments across deltas)
  - prompt processing progress lines present
  - multiple sessions in one file
  - malformed/partial JSON (edge case)

**Deliverables**

- ✅ Fixture files in repo
- ✅ A short `fixtures/README.md` describing what each file contains

**Acceptance**

- ✅ Fixture set is sufficient to test parser logic

---

### 1.2 Document the observed log grammar (internal doc) - ✅ COMPLETED

**Tasks**

- ✅ Write `docs/log-format.md` describing:
  - known line prefixes and timestamps
  - JSON blocks that may span multiple lines
  - how chat ids appear (packet JSON `id`)
  - where usage appears
  - where tool_calls appear

**Deliverables**

- ✅ `docs/log-format.md`

**Acceptance**

- ✅ Another dev can implement parser from this document alone

---

## 2) Data Model & Types - ✅ COMPLETED

### 2.1 Define core types - ✅ COMPLETED

**Tasks**

- ✅ Create `types/types.ts`:
  - ✅ `Session`, `SessionMetrics`
  - ✅ `TimelineEvent` union
  - ✅ `ToolCallEvent`, `RequestEvent`, etc.

**Deliverables**

- ✅ TypeScript types with comments

**Acceptance**

- ✅ Types compile without errors
- ✅ Types used by parser and API

---

### 2.2 Normalized event schema - ✅ COMPLETED

**Tasks**

- ✅ Canonical timestamp format (ISO string)
- ✅ `durationMs` conventions defined
- ✅ Raw data storage approach documented

**Deliverables**

- ✅ `types/types.ts` with normalized schema

**Acceptance**

- ✅ Clear, consistent structures for timeline rendering

---

## 3) Parser (Core Engine)
- ✅ COMPLETED
- Parse standard log prefix:
  - `[YYYY-MM-DD HH:MM:SS][LEVEL]...`
- Emit tokens:
  - `{ ts, level, message, rawLine }`

**Deliverables**

- ✅ `lib/parser/lineReader.ts`
- ⏳ Unit tests against fixture files

**Acceptance**

- ✅ Correctly extracts timestamps and message text for every fixture line

---

### 3.2 Multiline JSON extractor (brace-balanced)

**Tasks**

- Detect JSON start for lines containing:
  - `Received request: POST to /v1/chat/completions with body {`
  - `Generated packet: {`
- Implement brace-balancing accumulator:
  - handles nested braces
  - handles braces inside JSON strings (important!)
    - recommended approach: use a small state machine tracking string/escape state
- Return parsed object + `rawJson` string
- Gracefully handle parse errors:
  - emit `parser_error` event containing raw snippet + ts

**Deliverables**

- ✅ `lib/parser/jsonBlock.ts`
- ⏳ Tests:
  - successful extraction
  - braces in strings
  - malformed JSON produces error event but does not crash

**Acceptance**

- ✅ Parser never crashes on malformed fixture lines
- ✅ Correctly reconstructs JSON blocks spanning multiple lines

---

### 3.3 Event classification & extraction

**Tasks**

- Convert tokens into normalized events:
  - `request_received` with request body (messages, model, tools if present)
  - `prompt_progress` with percent
  - `packet_generated` with packet JSON
  - `stream_finished`
- Add “raw” fallback events optionally (for debugging)

**Deliverables**

- ✅ `lib/parser/events.ts`
- ⏳ Tests verifying event types emitted per fixture

**Acceptance**

- ✅ Events are emitted in correct chronological order with correct timestamps

---

### 3.4 Session correlation (request → chat id)

**Tasks**

- Implement heuristic mapping:
  - store “pending request” objects keyed by time
  - when a new packet with unknown chat id appears shortly after, attach nearest pending request
- Configurable window (e.g. 5–15 seconds)
- Guard against mismatches:
  - if multiple pending requests, choose closest in time
  - record a correlation confidence score (optional)

**Deliverables**

- ✅ `lib/parser/sessionLinker.ts`
- ⏳ Tests with fixture containing multiple interleaved sessions

**Acceptance**

- ✅ In fixtures, request is attached to correct chat id session

---

### 3.5 Tool call aggregation (merge partial arguments)

**Tasks**

- Extract `choices[].delta.tool_calls[]`
- Merge tool call entries by `tool_call.id`:
  - accumulate `function.arguments` strings across deltas
  - track first seen ts and last updated ts
- Attempt to parse arguments as JSON if final string is valid
- Store both:
  - `argumentsText` (raw)
  - `argumentsJson` (parsed or null)

**Deliverables**

- ✅ Tool call aggregation implemented in parser pipeline
- ⏳ Tests for partial argument streaming

**Acceptance**

- ✅ Tool calls show correct merged args during runtime validation

---

### 3.6 Assistant content reconstruction

**Tasks**

- Concatenate `choices[].delta.content` across packets
- Track:
  - first content ts
  - last content ts
- Store chunks for timeline display (optional):
  - either store as one combined string + chunk boundaries
  - or store chunk events and compute combined on the fly

**Deliverables**

- ✅ `lib/parser/content.ts`
- ⏳ Tests verifying reconstructed content matches expected

**Acceptance**

- ✅ Timeline can show full assistant response text

---

### 3.7 Usage extraction & metrics computation

**Tasks**

- Detect `usage` field in final packet (often in last chunk)
- Compute per-session metrics:
  - `promptTokens`, `completionTokens`, `totalTokens`
  - `streamLatencyMs` = first packet ts → stream finished ts
  - `tokensPerSecond` = completionTokens / (latency seconds)
  - `promptProcessingMs`:
    - first prompt progress ts (0% or first seen) → first packet ts
    - if missing, null
- Store computed metrics on session

**Deliverables**

- ✅ `lib/parser/metrics.ts`
- ⏳ Tests with fixtures containing usage and progress lines

**Acceptance**

- ✅ Metrics validated against runtime samples

---

## 4) Indexer (File Discovery + Caching) - ✅ COMPLETED

### 4.1 Log folder discovery (Mac)

**Tasks**

- Resolve log root
- Scan month folders `[yyyy-mm]`
- Pick:
  - latest month by default
  - optional: include last N months/days config
- List `.log` files in month folder sorted by date

**Deliverables**

- ✅ `lib/indexer/discovery.ts`

**Acceptance**

- ✅ Returns ordered list of files in a real LM Studio log directory

---

### 4.2 In-memory session index

**Tasks**

- Parse each file and update `Map<chatId, Session>`
- Store lightweight list item summary:
  - `chatId`, `firstSeenAt`, `model`, token totals if known
- Provide functions:
  - `buildIndex()`
  - `getSessionsList()`
  - `getSession(chatId)`

**Deliverables**

- ✅ `lib/indexer/index.ts`

**Acceptance**

- ✅ Index builds incrementally and publishes partial results while indexing

---

### 4.3 Refresh & invalidation

**Tasks**

- Implement:
  - “last indexed at” timestamp
  - manual refresh endpoint
- Optional: simple file mtime caching to skip unchanged files

**Deliverables**

- ✅ `lib/indexer/cache.ts`
- ✅ refresh endpoint implemented (`POST /api/index`)

**Acceptance**

- ✅ Refresh updates session list and reparses on force refresh

---

## 5) API Routes (Server-only) - ✅ COMPLETED

### 5.1 `GET /api/sessions`

**Tasks**

- Returns list of sessions:
  - `[{ chatId, firstSeenAt, model, promptTokens, completionTokens, streamLatencyMs }]`
- Support query params:
  - `q=` search by chat id substring
  - `limit=`
  - `offset=` or `cursor=` (optional v0)

**Deliverables**

- ✅ `app/api/sessions/route.ts`

**Acceptance**

- ✅ Sidebar can load and filter sessions via this endpoint

---

### 5.2 `GET /api/sessions/[chatId]`

**Tasks**

- Returns full session:
  - request messages
  - tool calls
  - metrics
  - timeline events (normalized)
- Ensure response size is acceptable:
  - consider truncation rules (optional):
    - cap raw content size per event
    - offer “raw mode” later

**Deliverables**

- ✅ `app/api/sessions/chatId/route.ts`

**Acceptance**

- ✅ Selecting a request/session loads full details reliably

---

## 6) Frontend UI (shadcn + Tailwind only) - ✅ COMPLETED

### 6.1 App shell layout

**Tasks**

- Two-pane layout:
  - left sidebar: fixed width, scrollable list
  - right content: scrollable details
- Route state:
  - use `?session=` query param or dynamic route `/session/[chatId]`
- Loading and error states:
  - skeletons (shadcn)
  - empty state when no sessions

**Deliverables**

- ✅ `app/page.tsx` session-first layout
- ✅ Sidebar + detail shell implemented

**Acceptance**

- ✅ App boots with loading/indexing/empty states

---

### 6.2 Sidebar: sessions list

**Tasks**

- Search input with debounced fetch
- List items with:
  - truncated id + copy button
  - model badge
  - token badge
  - time badge (firstSeenAt)
- Highlight selected session

**Deliverables**

- ✅ `components/sessions/SessionsSidebar.tsx`

**Acceptance**

- ✅ User can filter and select sessions quickly

---

### 6.3 Section: Tool Calls UI

**Tasks**

- Render tool calls as Accordion items:
  - header: tool name + tool id + requested time
  - body: arguments table (key/value) if JSON
  - raw arguments in code block
- Timing display:
  - inferred duration if available else “Unknown”

**Deliverables**

- ✅ Tool calls are integrated in request detail UI (`TimelinePanel`)

**Acceptance**

- ✅ Tool calls are readable, collapsible, and usable for debugging

---

### 6.4 Section: Performance Metrics UI

**Tasks**

- Render metrics table
- Show derived values:
  - tokens/sec with 2 decimals
  - latency in ms + human readable (e.g. 1.23s)
- Show “Unknown” for missing values

**Deliverables**

- ✅ Session overview and request metrics panels are implemented

**Acceptance**

- ✅ Metrics appear correct for sessions with usage

---

### 6.5 Section: Session Timeline UI

**Tasks**

- Timeline list of cards:
  - event title, timestamp
  - duration since previous event
  - collapsible details:
    - request messages (system/user/assistant)
    - assistant reconstructed content
    - tool call details inline
- Provide “Show raw JSON” toggle per event (Collapsible)

**Deliverables**

- ✅ `components/session/TimelinePanel.tsx`

**Acceptance**

- ✅ Timeline supports auditing prompts and responses end-to-end

---

### 6.6 Session Navigation (Updated)
**Tasks**

- Replaced tabbed request view with always-visible request data + timeline
  - Added dedicated session screen sections:
  - Session Overview
  - Stats (TPS + total tokens chart)
  - Prompt Audit
  - Requests table + right drawer request detail

**Deliverables**

- ✅ Session page sections and request drawer UX

**Acceptance**

- ✅ Session detail view is navigable and scannable without tab switching

---

## 7) QA, Testing, and Hardening - ⏳ IN PROGRESS

### 7.1 Unit tests for parser/indexer

**Tasks**

- Use Vitest or Jest
- Test:
  - multiline JSON extraction
  - tool call merge logic
  - session linking heuristic
  - metrics computations

**Deliverables**

- `lib/**/__tests__/*`

**Acceptance**

- CI-ready test suite runs fast and reliably

---

### 7.2 Robustness + edge cases

**Tasks**

- Handle:
  - log truncation mid-JSON
  - missing stream finished lines
  - sessions spanning multiple log files
  - interleaved sessions
- Add safe guards:
  - max JSON size limit (configurable)
  - max events stored per session (optional)

**Deliverables**

- Error handling improvements and documented constraints

**Acceptance**

- App doesn’t crash on “weird” logs; shows partial info gracefully

---

### 7.3 Developer diagnostics

**Tasks**

- Add optional debug view:
  - raw events list
  - parser errors list
- Add server logs around indexing duration

**Deliverables**

- `components/debug/*` (optional gated behind env `DEBUG=true`)

**Acceptance**

- Easier to diagnose parsing issues in the field

---

## 8) Documentation & Release

### 8.1 README

**Tasks**

- Project overview
- Install/run instructions
- Configuration (`LMS_LOG_ROOT`)
- Supported platforms (Mac v0)
- Known limitations (tool timing inference)

**Deliverables**

- `README.md`

**Acceptance**

- Fresh dev can run it in <10 minutes

---

### 8.2 Roadmap tracking & issue templates

**Tasks**

- Convert major milestones to GitHub issues
- Add issue templates:
  - bug report
  - parser edge case request
  - feature request

**Deliverables**

- `.github/ISSUE_TEMPLATE/*` (optional)

**Acceptance**

- Contributors can file consistent issues

---

## Suggested Work Allocation (Agent-Friendly)

### Agent A — Parser Core

- 3.1–3.7 (line reader, JSON extractor, event extraction, tool merge, metrics)

### Agent B — Indexer + API

- 4.1–4.3, 5.1–5.2

### Agent C — UI Shell + Sidebar

- 6.1–6.2

### Agent D — Session Detail Panels

- 6.3–6.6 (Tool Calls, Metrics, Timeline, Tabs)

### Agent E — QA + Docs

- 7.1–7.3, 8.1–8.2

---

## MVP Exit Checklist

- [x] Sessions list loads from real LM Studio log directory
- [x] Selecting a session/request shows Tool Calls, Metrics, Timeline
- [x] Tool call arguments merge correctly across deltas
- [x] Metrics computed (tokens, latency, tokens/sec) when usage exists
- [x] Timeline shows system/user prompts and reconstructed assistant content
- [x] App handles malformed logs without crashing
- [ ] README included with setup + configuration

---

## 9) Completed Enhancements (Post-MVP Scope)

- ✅ Session hierarchy evolved to `Date -> Session -> Request` with checksum-based grouping.
- ✅ Request anchoring and orphan-log stitching added to prevent cross-session drift.
- ✅ Session-first UX shipped (session screen, collapsible cards, request drawer).
- ✅ Prompt Audit card added (messages + system tabs, collapsed by default, scrollable).
- ✅ Stats card added with Recharts line chart (TPS + total tokens, brush zoom, tooltips, legend).
- ✅ Client detection + branding support added (`Opencode`, `Codex`, `Claude`, `Unknown`) with icons.
- ✅ Settings page + Genkit integration shipped for AI session renaming.
- ✅ AI renamer now supports env/custom API tokens, provider/model selection, and session name persistence.
