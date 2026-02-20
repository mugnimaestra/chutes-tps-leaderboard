# ⚡ LLM Speed Index — Chutes TPS Leaderboard

A real-time dashboard showing tokens/second (TPS) benchmarks for all LLM models hosted on [Chutes.ai](https://chutes.ai), sorted by fastest inference speed.

## 🔗 Live Demo

Visit the live site: [GitHub Pages link will be added after deployment]

## Features

- **Real-time data** — Fetches the latest TPS data directly from Chutes.ai
- **56+ LLM models** — All vLLM-based models in the Chutes catalogue
- **Progressive loading** — Models appear as their stats are fetched
- **Search & sort** — Filter by name, sort by TPS/name/requests
- **Local caching** — Results cached for 1 hour to avoid repeated fetches
- **Premium dark theme** — Mission Control aesthetic with glassmorphic UI
- **Zero dependencies** — Pure HTML/CSS/JS, no build step required

## How It Works

1. Fetches the Chutes.ai catalogue page via CORS proxy
2. Parses server-side rendered HTML to extract LLM model data
3. Identifies models using `standard_template:"vllm"` classification
4. Fetches individual stats pages for each model (concurrency: 3)
5. Displays results sorted by highest TPS

## Tech

- Vanilla HTML/CSS/JS (no frameworks)
- CORS proxy fallback chain (corsproxy.io → allorigins)
- CSS glassmorphism, film grain, scanlines, tech grid
- Google Fonts: Chakra Petch, Space Grotesk, JetBrains Mono
- LocalStorage caching

## Local Development

Just open `index.html` in a browser. No server or build step needed.

## License

MIT
