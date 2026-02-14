# LMS Log Explorer Roadmap (Living Baseline)

Last updated: 2026-02-14

This roadmap has been reset to the current shipped baseline so it can be
maintained as a living document.

## 1. MVP Delivery Status

### Completed

- ✅ Next.js + TypeScript + Tailwind + shadcn/ui app shell
- ✅ LM Studio log discovery from `LMS_LOG_ROOT` month/day log layout
- ✅ Parser pipeline for request, prompt progress, stream packets, and stream finish
- ✅ Multiline JSON reconstruction for request/packet payloads
- ✅ Tool-call delta merge with id/index fallback
- ✅ Session metrics (tokens, prompt processing, stream latency, tokens/sec)
- ✅ Session-group model (group requests into parent session groups)
- ✅ SQLite-backed persistent index and indexed file metadata
- ✅ Incremental index refresh with force rebuild support
- ✅ API routes for index status, sessions list/detail, debug
- ✅ Session-first UI (sidebar, session overview, stats, prompt audit, requests)
- ✅ Request drawer with request data, tool calls, and request timeline
- ✅ Background indexing progress overlay and live UI refresh behavior
- ✅ AI Session Renamer settings + run endpoint (optional)
- ✅ Unit/integration tests (Vitest) and E2E tests (Playwright)

### Baseline Quality Gates (Current)

- ✅ `pnpm lint`
- ✅ `pnpm type-check`
- ✅ `pnpm test:unit`
- ✅ `pnpm test:e2e`

## 2. Current Architecture Milestones

### Parsing and indexing

- Session creation is request-anchored
- Stream and prompt events are aggregated to reduce timeline noise
- Deterministic session IDs are stable across rebuilds
- SQLite store supports startup hydration and incremental file re-indexing

### UX

- Sidebar groups sessions by date and parent session
- Main page shows high-level session aggregates plus request list
- Prompt Audit and Stats are first-class panels
- Request details open in a right-side drawer

### Operability

- `/api/index` supports asynchronous indexing and force refresh
- `/api/debug/index` is available behind `DEBUG=true`
- Local and Docker workflows are documented in `README.md`

## 3. Post-MVP Backlog (Prioritized)

### Priority 1

- ⬜ Add richer parser regression fixture set from real-world noisy logs
- ⬜ Add stronger API contract tests for pagination/search/error states
- ⬜ Add explicit observability counters (files scanned, parse failures, skipped sessions)

### Priority 2

- ⬜ Add timeline diff/comparison view across requests in same session group
- ⬜ Add export options for session/request timeline data
- ⬜ Add advanced query/filter controls (client/model/time/token ranges)

### Priority 3

- ⬜ Add optional remote log root support with strict safety guardrails
- ⬜ Add historical trend dashboards across many session groups

## 4. Documentation Maintenance Rules

- Update this roadmap when a feature is shipped, cut, or reprioritized
- Keep status aligned with actual code and tests, not planned intent
- Record only active backlog items; remove stale or legacy phases
