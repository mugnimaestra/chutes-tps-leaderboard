export async function getMeta(db: D1Database, key: string) {
  const row = await db
    .prepare("SELECT value FROM meta WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function setMeta(db: D1Database, key: string, value: string) {
  await db
    .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)")
    .bind(key, value)
    .run();
}

export async function upsertModel(
  db: D1Database,
  model: {
    chute_id: string;
    name: string;
    latest_tps: number;
    latest_ttft: number;
    latest_requests: number;
    avg_7d: number;
    avg_30d: number;
    peak_tps: number;
    latest_date: string;
    scraped_at: string;
  },
) {
  await db
    .prepare(
      `INSERT OR REPLACE INTO models (chute_id, name, latest_tps, latest_ttft, latest_requests, avg_7d, avg_30d, peak_tps, latest_date, scraped_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      model.chute_id,
      model.name,
      model.latest_tps,
      model.latest_ttft,
      model.latest_requests,
      model.avg_7d,
      model.avg_30d,
      model.peak_tps,
      model.latest_date,
      model.scraped_at,
    )
    .run();
}

export async function allModels(db: D1Database) {
  const result = await db
    .prepare("SELECT * FROM models ORDER BY latest_tps DESC")
    .all();
  return result.results;
}
