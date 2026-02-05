# LMS Log Dashboard — Roadmap (Detailed)

This roadmap breaks the project into small, parallelizable work items suitable for multiple agents. Each phase ends with clear deliverables and acceptance checks.

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

## 1) Log Format Recon & Sample Fixtures

### 1.1 Build fixtures from sample logs
**Tasks**
- Add `fixtures/` (not committed if too large; keep small representative snippets)
- Create 3–5 small fixture log files covering:
    - simple chat completion with streaming
    - tool call (with partial arguments across deltas)
    - prompt processing progress lines present
    - multiple sessions in one file
    - malformed/partial JSON (edge case)

**Deliverables**
- Fixture files in repo (or generated in tests)
- A short `fixtures/README.md` describing what each file contains

**Acceptance**
- Fixture set is sufficient to test parser logic

---

### 1.2 Document the observed log grammar (internal doc)
**Tasks**
- Write `docs/log-format.md` describing:
    - known line prefixes and timestamps
    - JSON blocks that may span multiple lines
    - how chat ids appear (packet JSON `id`)
    - where usage appears
    - where tool_calls appear

**Deliverables**
- `docs/log-format.md`

**Acceptance**
- Another dev can implement parser from this document alone

---

## 2) Data Model & Types
