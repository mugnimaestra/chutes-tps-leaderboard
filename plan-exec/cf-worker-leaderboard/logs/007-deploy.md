# Step 007: Deploy to Cloudflare

## TypeScript Check

```
npx tsc --noEmit
```

Result: **Clean** — no errors.

## Wrangler Deploy

```
npx wrangler deploy
```

Output:

```
✨ Read 1 file from the assets directory
Uploaded 1 of 1 asset
✨ Success! Uploaded 1 file (1.19 sec)

Total Upload: 5.63 KiB / gzip: 2.22 KiB
Bindings: env.DB (chutes-leaderboard) → D1 Database

Uploaded chutes-tps-leaderboard (72.19 sec)
Deployed chutes-tps-leaderboard triggers (6.76 sec)
  https://chutes-tps-leaderboard.mugnimaestra2.workers.dev
  schedule: */10 * * * *
Current Version ID: 5a900032-92bc-4ea6-849e-132e413331ac
```

## Deployed URL

**https://chutes-tps-leaderboard.mugnimaestra2.workers.dev**

## API Test

```
curl -s https://chutes-tps-leaderboard.mugnimaestra2.workers.dev/api/models
```

Response:

```json
{"models":[],"total":0,"scraped_at":null}
```

API is responding correctly. Returns empty models because the cron hasn't fired yet.

## D1 Database Check

```
npx wrangler d1 execute chutes-leaderboard --remote --command "SELECT count(*) FROM models"
```

Result: `count(*) = 0` — table exists, no rows yet.

- Served by: v3-prod (APAC / SIN)
- DB size: 28,672 bytes

## Cron Schedule

The cron trigger `*/10 * * * *` is active and will automatically scrape Chutes every 10 minutes. Data will appear after the first cron execution.

## Status: ✅ DEPLOYED

## Post-Fix Redeployment (2026-02-21)

### Issues Found
- Original deployment had old code without error handling or diagnostic endpoints
- `/api/scrape` and `/api/health` were returning 404 (not deployed)
- Cron was silently failing — D1 had 0 models
- `BATCH_SIZE=25` with `Promise.all` parallel fetching exceeded Worker resource limits (Error 1102)

### Fixes Applied
1. Reduced `BATCH_SIZE` from 25 → 5
2. Changed model stats fetching from parallel (`Promise.all`) to sequential (`for...of`)
3. Redeployed with all code fixes (error handling, logging, `/api/health`, `/api/scrape`)

### Redeployment
- Version: `04f7c872`
- D1 schema applied to remote
- Manual scrape test: `{"scraped":5,"total":56,"errors":0}` ✅
- Health check: `{"status":"ok","models_count":5,"last_scraped_at":"2026-02-21T10:18:42.312Z"}` ✅
- Frontend serves at root URL ✅
- Cron trigger active: `*/10 * * * *`

### Status: ✅ FULLY OPERATIONAL
