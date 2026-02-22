# Step 006 – Frontend (public/index.html JavaScript)

## What was done
Appended the client-side JavaScript to `public/index.html` and closed the document with `</script></body></html>`.

## Key details
- **State**: single `models` array populated from `/api/models` endpoint
- **updateHeroStats()**: computes total models, avg TPS, peak TPS and updates the hero stat cards
- **renderGrid()**: filters by search query, sorts by TPS/name/requests, renders model cards with rank badges (gold/silver/bronze for top 3), TPS, TTFT, 7D/30D averages, and request counts
- **loadData()**: fetches `/api/models`, maps API response into internal model shape, updates hero stats + last-updated timestamp, then renders grid. On error, shows loading message and retries in 10s
- **Event listeners**: btnFetch (click → loadData), searchInput (input → renderGrid), sortSelect (change → renderGrid)
- **Auto-refresh**: `setInterval(loadData, 300000)` – every 5 minutes
- **No CORS proxy/scraping logic** – all data comes from the same-origin `/api/models` endpoint served by the Worker

## File changed
- `public/index.html`: 898 → 1034 lines (appended ~136 lines of JS + closing tags)
