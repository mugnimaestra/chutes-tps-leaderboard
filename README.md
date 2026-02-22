# ⚡ LLM Speed Index — Chutes TPS Leaderboard

A real-time dashboard showing tokens/second (TPS) benchmarks for all LLM models hosted on [Chutes.ai](https://chutes.ai), sorted by fastest inference speed.

## 🔗 Live

- **Cloudflare Workers**: [chutes-tps-leaderboard.mugnimaestra2.workers.dev](https://chutes-tps-leaderboard.mugnimaestra2.workers.dev/)
- **GitHub Pages** (legacy client-side version): [mugnimaestra.github.io/chutes-tps-leaderboard](https://mugnimaestra.github.io/chutes-tps-leaderboard/)

## Features

- **Real-time data** — Scrapes TPS stats from Chutes.ai every 10 minutes via cron
- **All LLM models** — Full catalogue from the OpenAI-compatible `/v1/models` API
- **Cloudflare Worker backend** — D1 SQLite database, serverless, fast globally
- **Search & sort** — Filter by name, sort by TPS/name/requests
- **Premium dark theme** — Mission Control aesthetic with glassmorphic UI

## How It Works

1. Cron trigger (every 10 minutes) calls the scraper
2. Fetches all models from `https://llm.chutes.ai/v1/models` JSON API
3. Fetches one stats page from Chutes.ai (contains data for all models)
4. Parses TPS/TTFT stats with regex, computes averages and peaks
5. Upserts all models into D1 database
6. Frontend fetches from `/api/models` and renders the leaderboard

## Tech

- **Backend**: Cloudflare Worker (TypeScript) + D1 SQLite
- **Frontend**: Static HTML/CSS/JS served by Workers Assets
- **Scraping**: OpenAI-compatible JSON API + HTML regex for stats
- **Styling**: CSS glassmorphism, film grain, scanlines, tech grid
- **Fonts**: Chakra Petch, Space Grotesk, JetBrains Mono

## Local Development

```bash
# Install dependencies
npm install

# Apply D1 schema locally
npx wrangler d1 execute chutes-leaderboard --local --file=schema.sql

# Run local dev server
npm run dev

# Trigger a manual scrape
curl -X POST http://localhost:8787/api/scrape

# Deploy to Cloudflare Workers
npm run deploy
```

## License

MIT
