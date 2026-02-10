# Development Status

## 2026-02-10

### SQLite Persistent Index + Incremental Refresh

- Added persistent SQLite store for indexed sessions and file metadata in `lib/indexer/sqliteStore.ts`.
- Persisted data now includes:
  - Parsed session payloads (request/events/tool calls/metrics)
  - Source file path + per-file session ordinal
  - Indexed file tracking (`path`, `checksum`, `mtime_ms`, `size_bytes`, `last_indexed_at`)
- Refactored index build flow to incremental behavior:
  - Load cached sessions from SQLite on startup
  - Parse only new/changed files
  - Skip unchanged files using `mtime + size`, with checksum verification when metadata differs
  - Always reparse the latest log file on refresh/index runs
  - Remove sessions for deleted log files
- Added deterministic session IDs scoped to source file + ordinal to keep stable persistence across runs.
- `sessionIndex` now hydrates from persisted SQLite cache before background indexing.
- Added SQLite dependencies: `better-sqlite3` and `@types/better-sqlite3`.

### Validation Summary (SQLite + Incremental)

- `pnpm type-check`: passes.
- `pnpm build`: passes.
- Runtime smoke test with synthetic log root:
  - First refresh indexed 2 files and produced 3 sessions.
  - Second refresh reparsed only latest file (only its `last_indexed_at` changed).
  - Adding a new dated log file and refreshing increased indexed files (`2 -> 3`) and sessions (`3 -> 4`).

### Indexing Throughput + Session Visibility Fixes

- Refactored index lifecycle to support non-blocking status checks and background indexing.
- Added `IndexingStatus` propagation through `/api/index` and `/api/sessions`.
- Added partial index publication during build so sessions become visible before full indexing completes.
- Fixed parser async loop yielding so non-event log lines do not starve API responsiveness.
- Added read-loop yielding in line reader to reduce long event-loop stalls during large file scans.
- Updated UI session hook behavior so loading does not block visible results while indexing continues.
- Added indexing progress modal wiring with live file and percentage details.

### Validation Summary

- `pnpm type-check`: passes.
- Targeted ESLint on touched index/parser/api/ui files: passes.
- Runtime probe:
  - `POST /api/index?force=1` returns `202` quickly.
  - `GET /api/sessions?limit=20` returns non-empty sessions while `status.state=indexing`.
  - Index reaches `ready` with full session counts (`2767` sessions in local logs).

### Stream Timeline Aggregation

- Replaced per-packet `stream_chunk` timeline events with one aggregated stream response event per session.
- Aggregated stream event now includes:
  - `chunkCount`: total number of streamed packets
  - `elapsedMs`: elapsed time from first to last chunk
  - `responseText`: concatenated `delta.content` across all chunks
  - `firstChunkTs` and `lastChunkTs` for inspection and duration formatting
- Updated timeline UI label and detail rendering to show one `Stream Response` block with the aggregated metadata and full concatenated text.

### Validation Summary (Stream Aggregation)

- `pnpm type-check`: passes.
- Targeted ESLint on changed parser/timeline/type files: passes.
- Runtime API verification:
  - Sample session returned `stream_event_count=1`
  - Stream event contains required keys: `chunkCount`, `elapsedMs`, `responseText`
  - Example payload: `chunkCount=207`, `elapsedMs=8000`, `responseLen=937`

### Prompt Processing + Timeline + Sidebar UX

- Timeline header durations now support event-specific elapsed values for:
  - aggregated `stream_chunk` (stream response)
  - aggregated `prompt_processing`
- Prompt progress events are now aggregated into a single `prompt_processing` timeline event per session:
  - `eventCount`
  - `elapsedMs`
  - `firstPromptTs`
  - `lastPromptTs`
  - `lastPercent`
- Prompt processing parser event naming updated to `prompt_processing`.
- Prompt processing metric now computes elapsed time from first prompt progress line to last prompt progress line.
- Prompt progress parsing regex hardened to support comma/period decimal separators.
- Sessions sidebar now groups sessions by day.
- Sidebar default width increased and horizontal resize handle added for desktop.

### Validation Summary (Prompt + Sidebar)

- `pnpm type-check`: passes.
- Targeted ESLint on parser/sidebar/timeline/type updates: passes.
- Runtime API verification:
  - Sample session payload: `prompt_processing_events=1`, `prompt_elapsedMs=1000`, `prompt_eventCount=3`
  - Sample session payload: `stream_chunk_events=1`, `stream_elapsedMs=8000`
  - Session retrieval remains healthy (`total=2767`).

### Timeline JSON UX + Sidebar Cleanup

- Added reusable JSON viewer with:
  - syntax-highlighted primitives/keys
  - collapsible object/array nodes
  - constrained overflow (`max-width` + `max-height`, scrollable)
- Replaced raw request/event payload `<pre>` blocks with the new JSON viewer.
- Updated generic event details rendering to show JSON viewer for structured payloads.
- Sidebar refinements:
  - date groups are collapsible and collapsed by default
  - session list item title uses `session-...` only
  - removed model badge from session list items
  - moved refresh action to a small icon button above the session list
  - removed session count labels in sidebar header/footer
- Session loading now pages through `/api/sessions` and accumulates all sessions instead of fixed `limit=200`.

### Validation Summary (JSON + Sidebar Cleanup)

- `pnpm type-check`: passes.
- Targeted ESLint on JSON/timeline/sidebar/session-hook files: passes.
- Runtime API verification:
  - Pagination smoke test: `totalCount=2767`, paged aggregate=`2767`, `matches=True`
  - Event typing smoke test: `has_prompt_processing=True`, `has_prompt_progress=False`, `has_stream_chunk=True`

### Duration Formatting Consistency

- Added shared duration formatting helper for UI time metrics.
- Updated duration displays in timeline, metrics panel, and tool-calls panel to render values over 60 seconds as `Xm Ys`.
- Standardized all affected views to reuse the same formatter for consistency.

### Validation Summary (Duration Formatting)

- `pnpm type-check`: passes.
- Targeted ESLint on duration-related files: passes.

## 2026-02-09

### Linting/Formatting Baseline Migration

- Migrated linting setup to `@vercel/style-guide` baseline (article-aligned).
- Replaced flat ESLint config with legacy `.eslintrc.cjs` and enabled ESLint legacy mode in scripts for ESLint 8 compatibility.
- Added Prettier configuration via `@vercel/style-guide/prettier`.
- Updated TypeScript config to extend `@vercel/style-guide/typescript/node20` with Next.js-specific compiler options preserved.
- Added scripts: `lint:fix`, `format`, `format:check`, `type-check`.

### Validation Summary

- `pnpm lint`: passes (zero warnings, zero errors).
- `pnpm type-check`: fails due pre-existing strict TypeScript issues in parser modules.
- `pnpm format:check`: fails due existing formatting drift across repository files.

### Lint Warning Remediation

- Cleared all remaining ESLint warnings across API routes, parser/indexer modules, hooks, and UI components.
- Replaced dynamic `require` + `import("fs")` annotations with typed `node:fs` imports in API routes.
- Fixed strict boolean/template checks, button `type` attributes, and promise handling in hooks.
- Replaced `<img>` with `next/image` in `components/component-example.tsx`.

### TypeScript + Formatting Hardening

- Fixed strict parser type-check failures in:
  - `lib/parser/content.ts`
  - `lib/parser/events.ts`
  - `lib/parser/lineReader.ts`
  - `lib/parser/metrics.ts`
  - `lib/parser/sessionLinker.ts`
- Added explicit guards for regex captures, array-index access, and timestamp component parsing.
- Ran repository-wide Prettier formatting to align with style-guide defaults.

### Validation Summary (Updated)

- `pnpm lint`: passes (zero warnings, zero errors).
- `pnpm type-check`: passes.
- `pnpm format:check`: passes.
