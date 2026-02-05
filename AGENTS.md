# AGENTS.md — Project Guidelines for LMS Log Explorer

## 🛠️ Build & Test Commands

### Development
- `pnpm dev` - Start Next.js development server
- `pnpm build` - Production build
- `pnpm start` - Start production server

### Testing
- `pnpm test` - Run all tests (Jest/Vitest)
- `pnpm test --watch` - Watch mode
- `pnpm test path/to/file.test.ts` - Run specific test file
- `pnpm test --coverage` - Run with coverage report

### Linting & Formatting
- `pnpm lint` - Run ESLint
- `pnpm lint --fix` - Auto-fix linting errors
- `pnpm format` or `pnpm prettier --write .` - Format files

## 📋 Code Style Guidelines (Next.js + TypeScript)

### Project Structure
```
app/              # Next.js App Router pages and API routes
components/       # React components (shadcn/ui components in components/ui/)
lib/              # Business logic: parser/, indexer/, config/
types/            # TypeScript type definitions
public/           # Static assets
styles/           # Global CSS (Tailwind config)
```

### Naming Conventions
- Components: `PascalCase` (e.g., `SessionsSidebar`, `ToolCallsPanel`)
- Hooks: `useCamelCase` (e.g., `useSessionIndex`, `useLogRoot`)
- Functions/Variables: `camelCase` (e.g., `parseLogLine`, `sessionCount`)
- Types/Interfaces: `PascalCase` (e.g., `Session`, `TimelineEvent`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_LOG_ROOT`, `MAX_LOG_SIZE`)
- API Routes: lowercase with slashes (e.g., `/api/sessions`, `/api/sessions/[chatId]`)

### TypeScript
- Strict mode: enable `strict: true` in `tsconfig.json`
- Define explicit types for all props and return values
- Use interfaces for object shapes, types for unions/literals
- Avoid `any`; use `unknown` or proper type guards instead
- Use async/await with proper error handling in API routes

### React Patterns
- Functional components only (no class components)
- Use hooks for state and side effects
- Component props typed with `Props` interface:
  ```typescript
  interface ToolCallsPanelProps {
    sessionId: string;
    className?: string;
  }
  ```
- Server components by default; use `'use client'` only for interactivity

### Imports
- Order: `react` → external libs → internal → styles
- Use absolute imports from project root: `import { parseLog } from 'lib/parser';`
- No wildcard imports
- Group and sort alphabetically

### Error Handling
- User-facing errors: show toast/toast notifications
- Server-side errors in API routes: return proper status codes
- Parse errors: log and emit graceful fallback events (don't crash)
- Never silently swallow errors

### Styling
- Use Tailwind utility classes exclusively
- Follow shadcn/ui component patterns and conventions
- Responsive: mobile-first with `sm:`, `md:` breakpoints
- Consistent spacing using `spacing` scale (no arbitrary values)

### Component Patterns (shadcn/ui)
- Use primitives: `Card`, `Accordion`, `Table`, `Tabs`, `Badge`, `Separator`, `Collapsible`
- API routes must be server-only (filesystem access only in `app/api/`)

## 🎯 Roadmap & Spec Compliance

### Mandatory Pre-Task Steps
 1. Read `docs/roadmap.md` to identify current stage
 2. Read `docs/spec.md` for technical requirements
 3. Create feature branch: `git checkout -b agent/phase-<n>-<description>`
 4. Create PR in Draft mode: `gh pr create --draft`
 5. Implement per spec requirements
 6. Update `docs/roadmap.md` to mark completed items

### Branching Strategy
 - Each roadmap stage = separate branch from main with `agent/phase-<n>-` prefix
 - PR title format: `<type>(scope): <message>` (e.g., `feat(parser): add multiline JSON extractor`)
 - Keep PR in Draft until all tasks in stage are complete
 - Merge only after tests pass and acceptance criteria met

### Git Practices (USE YEEET SKILL FOR PR CREATION)
 - Commit format: `<type>(scope): <subject>` (max 50 chars)
     - Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`
     - Scopes: lowercase dash-separated (`parser`, `indexer`, `ui`, `api`)
 - Body wraps at 72 chars; explain WHY more than WHAT
 - Reference issues: `Fixes #123` or `Refs #456`
 - ** yeet skill for staging, committing, pushing, and opening PRs**
 - When stage is complete: trigger Yeet skill to commit + push + request review

## 🧰 MCP Tools

### Chroma RAG
- Create project collection: `chroma_chroma_create_collection(collection_name='rag-lms-log-explorer')`
- Query before implementing new features
- Save architecture decisions, API contracts, patterns

### Context7
- Query documentation for dependencies (Next.js, shadcn/ui, Tailwind)
- Use `context7_resolve_library_id` then `context7_query_docs`

### shadcn-ui Skill
- Use for all UI component tasks
- Generate proper shadcn primitives (Table, Accordion, Tabs, etc.)

### Frontend-Design Skill
- Use for page layout and visual design
- Ensure responsive, accessible UI

### Yeet Skill
- Use for staging, committing, pushing, and opening PRs in one flow
- Trigger after completing all tasks in a roadmap stage
- Uses GitHub CLI (`gh`) to create PR with body from conventional commit message

## 🚀 MVP Deliverables (per Roadmap)

1. ✅ Project bootstrap (Next.js + TypeScript + Tailwind + shadcn)
2. Log parser (multiline JSON, tool call aggregation, metrics)
3. Indexer (file discovery, session caching)
4. API routes (`GET /api/sessions`, `GET /api/sessions/[chatId]`)
5. UI (sidebar, tool calls panel, metrics panel, timeline)
6. QA + documentation

## 📝 Environment Variables
- `LMS_LOG_ROOT` — Path to LM Studio log directory (default: `~/.lmstudio/server-logs`)
- Expand `~` to home directory on server side

---

****Last Updated**: 2026-02-04 (Stage 0 complete)
**Source**: `docs/roadmap.md`, `docs/spec.md`
