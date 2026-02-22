# Step 001+002: Scaffold & D1 Database

## D1 Database
- **database_name:** `chutes-leaderboard`
- **database_id:** `1f265053-1371-452b-89c5-7b40a815c694`
- **region:** APAC
- **Schema applied:** 3 queries executed (models table, meta table, batch_offset seed row)

## Files Created
- `package.json` — project manifest with wrangler, typescript, @cloudflare/workers-types
- `tsconfig.json` — ES2022 + bundler module resolution + CF workers types
- `schema.sql` — D1 schema (models + meta tables)
- `wrangler.toml` — worker config with D1 binding, assets, cron trigger (*/10 * * * *)
- `src/index.ts` — minimal worker with /api/models stub and scheduled handler
- `public/index.html` — placeholder HTML

## Dependencies Installed
- 37 packages, 0 vulnerabilities

## Wrangler Dev
- Starts OK on `http://localhost:8787`
- D1 binding `env.DB` resolved in local mode
- Scheduled worker warning displayed (expected — manual trigger via curl)
