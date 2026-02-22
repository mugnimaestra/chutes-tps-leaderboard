import { allModels } from "./db";
import { scrapeBatch } from "./scraper";

export interface Env {
  DB: D1Database;
}

const ALLOWED_ORIGINS = [
  "https://mugnimaestra.github.io",
  "http://localhost:8787",
  "http://127.0.0.1:8787",
];

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data: unknown, request: Request, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/"))
      return new Response(null, { status: 204, headers: corsHeaders(request) });

    if (url.pathname === "/api/models") {
      const models = await allModels(env.DB);
      return json({
        models,
        total: models.length,
        scraped_at: models[0]?.scraped_at ?? null,
      }, request);
    }

    if (url.pathname === "/api/scrape" && request.method === "POST") {
      try {
        const result = await scrapeBatch(env.DB);
        return json(result, request);
      } catch (e) {
        console.error("Manual scrape failed:", e);
        return json({ error: String(e) }, request, 500);
      }
    }

    if (url.pathname === "/api/health") {
      try {
        const row = await env.DB.prepare(
          "SELECT count(*) as count, max(scraped_at) as last_scraped_at FROM models",
        ).first<{ count: number; last_scraped_at: string | null }>();
        return json({
          status: "ok",
          models_count: row?.count ?? 0,
          last_scraped_at: row?.last_scraped_at ?? null,
        }, request);
      } catch (e) {
        console.error("Health check failed:", e);
        return json({ status: "error", error: String(e) }, request, 500);
      }
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    try {
      const result = await scrapeBatch(env.DB);
      console.log(
        `Cron complete: scraped=${result.scraped} total=${result.total} errors=${result.errors}`,
      );
    } catch (e) {
      console.error(
        "Cron scheduled handler failed:",
        e instanceof Error ? e.stack : e,
      );
    }
  },
};
