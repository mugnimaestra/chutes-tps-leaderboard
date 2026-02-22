# AGENTS.md — Chutes TPS Leaderboard

## Project Overview

Cloudflare Worker (TypeScript) that scrapes LLM model benchmarks from Chutes.ai
and serves a real-time TPS (tokens/second) leaderboard via a static HTML frontend.
Two deployment targets: the Worker API (`src/`) and a static HTML site (`public/`).

### Architecture

- **Backend**: Cloudflare Worker with D1 SQLite database and cron-scheduled scraping
- **Frontend**: Static HTML served from `public/` by Cloudflare Workers Assets
- **Legacy frontend**: `index.html` (root) is a standalone client-side-only version using CORS proxies
- **Entry point**: `src/index.ts` — exports `fetch` (HTTP handler) and `scheduled` (cron handler)
- **Catalogue source**: The model catalogue now comes from the OpenAI-compatible `https://llm.chutes.ai/v1/models` JSON API instead of scraping HTML

### Key Files

| Path | Purpose |
|---|---|
| `src/index.ts` | Worker entry: API routes (`/api/models`, `/api/scrape`, `/api/health`) + cron |
| `src/scraper.ts` | Fetches model list from `/v1/models` API + stats from one HTML page, parses with regex |
| `src/db.ts` | D1 database helpers: `getMeta`, `setMeta`, `upsertModel`, `allModels` |
| `public/index.html` | Deployed frontend — fetches from `/api/models`, renders card grid |
| `index.html` | Legacy standalone frontend (client-side CORS proxy scraping) |
| `schema.sql` | D1 schema: `models` table + `meta` table for batch offset tracking |
| `wrangler.toml` | Cloudflare config: D1 binding, assets dir, cron schedule (`*/10 * * * *`) |

## Build / Dev / Deploy Commands

```bash
# Install dependencies
npm install

# Run local dev server (Wrangler + D1 local)
npm run dev              # alias: wrangler dev

# Deploy to Cloudflare Workers
npm run deploy           # alias: wrangler deploy

# Type-check (no emit — validates TypeScript)
npx tsc --noEmit

# Apply D1 schema (local)
npx wrangler d1 execute chutes-leaderboard --local --file=schema.sql

# Apply D1 schema (remote)
npx wrangler d1 execute chutes-leaderboard --remote --file=schema.sql

# Trigger a manual scrape (local dev must be running)
curl -X POST http://localhost:8787/api/scrape

# Test the API (local dev must be running)
curl http://localhost:8787/api/models
curl http://localhost:8787/api/health
```

### Testing

There is **no test framework** configured. There are no test files. If adding tests:
- Use `vitest` (Cloudflare Workers community standard)
- Place test files in `src/__tests__/` or colocated as `*.test.ts`
- Add `"test": "vitest run"` to `package.json` scripts
- For a single test: `npx vitest run src/__tests__/specific.test.ts`

### Linting / Formatting

There is **no linter or formatter** configured. The codebase uses consistent style.
If adding tooling, use `eslint` + `prettier` with Cloudflare Workers recommended config.

## Code Style Guidelines

### TypeScript

- **Strict mode** enabled: `"strict": true` in tsconfig
- **Target**: ES2022, ESNext modules, bundler module resolution
- **Types**: `@cloudflare/workers-types` for all Cloudflare globals (`D1Database`, `Request`, etc.)
- No explicit `any` usage — all function parameters and returns are typed
- Use inline object types for function params (see `upsertModel` in `db.ts`)
- Export the `Env` interface from `index.ts` for the D1 binding shape

### Imports

- Use named imports: `import { allModels } from "./db"`
- Relative paths with `./` prefix, no path aliases
- No barrel files — import directly from the source module
- Keep imports at the top of the file, one per line

### Naming Conventions

- **Files**: lowercase with hyphens — `scraper.ts`, `db.ts`, `index.ts`
- **Functions**: camelCase — `fetchCatalogue`, `scrapeBatch`, `upsertModel`
- **Interfaces/Types**: PascalCase — `Env`
- **Constants**: UPPER_SNAKE_CASE — `BATCH_SIZE`, `UA`, `PROXIES`
- **Variables**: camelCase — `chuteId`, `batchOffset`
- Prefix unused params with underscore: `_controller`, `_ctx`

### Formatting

- 2-space indentation
- Semicolons required
- Double quotes for strings (in TypeScript)
- Trailing commas in multi-line arrays/objects
- No trailing whitespace
- Single blank line between function definitions

### Functions

- Use `async function name()` for top-level exported functions
- Arrow functions for inline helpers and callbacks: `const avg = (arr) => ...`
- Keep functions focused — one responsibility per function
- Helper functions (`json`, `timed`) are module-scoped, not exported unless reused

### Error Handling

- Wrap external fetch calls in try/catch blocks
- Use `console.error` for error logging with context: `console.error("Manual scrape failed:", e)`
- Check `instanceof Error` before accessing `.stack`: `e instanceof Error ? e.stack : e`
- Convert errors to strings with `String(e)` for JSON responses
- Return appropriate HTTP status codes: 200 for success, 500 for errors, 404 for not found
- Use AbortController with timeouts for external HTTP requests (see `timed()` in scraper.ts)

### Database (D1)

- Use parameterized queries with `.bind()` — never string-interpolate SQL
- Use `INSERT OR REPLACE` for upserts keyed on primary key
- All DB access goes through `src/db.ts` helper functions
- Query results accessed via `.first<T>()` for single rows, `.all()` for multiple

### API Response Pattern

```typescript
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
```

- Always include CORS headers on API responses
- Return structured JSON: `{ models, total, scraped_at }` or `{ error: string }`
- Handle OPTIONS preflight with 204 No Content

### Frontend (HTML)

- Both HTML files are self-contained: inline CSS + inline JS, no build step
- CSS uses custom properties (`:root` variables) for theming
- BEM-like class naming: `.card-model-name`, `.rank-badge--gold`, `.stat-value--peak`
- Use `font-variant-numeric: tabular-nums` for number columns
- DOM accessed via `document.getElementById` — no framework abstractions
- Template literals for HTML rendering in JS

### Worker Patterns

- Default export object with `fetch` and `scheduled` handlers
- Cron runs every 10 minutes (`*/10 * * * *`), processes ALL models in one run
- Two HTTP fetches per run: catalogue API (JSON) + one stats page (HTML)
- Stats page contains data for all models; no per-model fetching needed
- `meta` table `batch_offset` key kept at "0" for backwards compatibility
- 30-second abort timeout on all external fetches

## Environment & Secrets

- `DB` binding: Cloudflare D1 database (configured in `wrangler.toml`)
- No API keys or secrets required — scraping uses public HTML pages
- Local dev uses `.wrangler/` for local D1 state
- `.dev.vars` in `.gitignore` for any future local env overrides

## Deployment

- Deployed to Cloudflare Workers via `wrangler deploy`
- Static assets in `public/` served automatically by Workers Assets
- D1 database `chutes-leaderboard` must have schema applied before first deploy
- Cron trigger activates `scheduled()` handler automatically after deploy
