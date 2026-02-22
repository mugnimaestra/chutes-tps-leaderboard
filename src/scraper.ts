import { setMeta, upsertModel } from "./db";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

async function timed(url: string, json: true): Promise<unknown>;
async function timed(url: string, json?: false): Promise<string>;
async function timed(url: string, json?: boolean) {
  console.log(`Fetching: ${url}`);
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), 30_000);
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: ctrl.signal,
  });
  clearTimeout(id);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  if (json) {
    const data = await res.json();
    console.log(`Fetched ${url} status=${res.status} (JSON)`);
    return data;
  }
  const text = await res.text();
  console.log(`Fetched ${url} status=${res.status} length=${text.length}`);
  return text;
}

interface CatalogueModel {
  chute_id: string;
  name: string;
}

interface StatsRow {
  chute_id: string;
  name: string;
  date: string;
  requests: number;
  tps: number;
  ttft: number;
}

interface ModelStats {
  chute_id: string;
  name: string;
  latest_tps: number;
  latest_ttft: number;
  latest_requests: number;
  avg_7d: number;
  avg_30d: number;
  peak_tps: number;
  latest_date: string;
}

export async function fetchCatalogue(): Promise<CatalogueModel[]> {
  const response = await timed("https://llm.chutes.ai/v1/models", true);
  const payload = response as { data?: unknown };
  if (!payload.data || !Array.isArray(payload.data)) {
    throw new Error(`Unexpected catalogue response shape: ${JSON.stringify(response).slice(0, 200)}`);
  }
  const models: CatalogueModel[] = payload.data.map((entry: { id: string; chute_id: string }) => ({
    chute_id: entry.chute_id,
    name: entry.id,
  }));
  console.log(`Catalogue API returned ${models.length} models`);
  return models;
}

export async function fetchAllStats(anyChuteId: string): Promise<Map<string, ModelStats>> {
  const html = await timed(
    `https://chutes.ai/app/chute/${anyChuteId}?tab=stats`,
  );

  const pattern =
    /chute_id:"([a-f0-9-]+)",name:"([^"]+)",date:"([^"]+)",total_requests:(\d+),total_input_tokens:(\d+),total_output_tokens:(\d+),average_tps:([0-9.eE+-]+),average_ttft:([0-9.eE+-]+)/g;
  const rows: StatsRow[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    rows.push({
      chute_id: m[1],
      name: m[2],
      date: m[3],
      requests: parseInt(m[4]),
      tps: parseFloat(m[7]),
      ttft: parseFloat(m[8]),
    });
  }
  console.log(`Stats page: ${rows.length} total rows parsed`);

  const grouped = new Map<string, StatsRow[]>();
  for (const row of rows) {
    const group = grouped.get(row.chute_id);
    if (group) {
      group.push(row);
    } else {
      grouped.set(row.chute_id, [row]);
    }
  }
  console.log(`Stats page: ${grouped.size} unique chute_ids found`);

  const avg = (arr: StatsRow[]) =>
    arr.length ? arr.reduce((s, r) => s + r.tps, 0) / arr.length : 0;

  const result = new Map<string, ModelStats>();
  for (const [chuteId, group] of grouped) {
    group.sort((a, b) => b.date.localeCompare(a.date));
    const latest = group[0];
    const peak = group.reduce((a, b) => (a.tps > b.tps ? a : b));
    result.set(chuteId, {
      chute_id: chuteId,
      name: latest.name,
      latest_tps: latest.tps,
      latest_ttft: latest.ttft,
      latest_requests: latest.requests,
      avg_7d: avg(group.slice(0, 7)),
      avg_30d: avg(group.slice(0, 30)),
      peak_tps: peak.tps,
      latest_date: latest.date,
    });
  }

  return result;
}

export async function scrapeBatch(db: D1Database) {
  try {
    console.log("Starting scrapeBatch...");
    const catalogue = await fetchCatalogue();
    const total = catalogue.length;
    if (total === 0) {
      console.warn("Catalogue returned 0 models — scrape aborted");
      return { scraped: 0, total: 0, errors: 0 };
    }

    const statsMap = await fetchAllStats(catalogue[0].chute_id);
    console.log(
      `Matching ${total} catalogue models against ${statsMap.size} stats entries`,
    );

    const now = new Date().toISOString();
    let errors = 0;
    let upserted = 0;
    for (const model of catalogue) {
      const stats = statsMap.get(model.chute_id);
      const record: ModelStats = stats
        ? { ...stats, name: model.name }
        : {
            chute_id: model.chute_id,
            name: model.name,
            latest_tps: 0,
            latest_ttft: 0,
            latest_requests: 0,
            avg_7d: 0,
            avg_30d: 0,
            peak_tps: 0,
            latest_date: "",
          };
      try {
        await upsertModel(db, { ...record, scraped_at: now });
        upserted++;
      } catch (e) {
        console.error(`DB upsert failed ${model.name}:`, e);
        errors++;
      }
    }

    const matched = catalogue.filter((m) => statsMap.has(m.chute_id)).length;
    await setMeta(db, "batch_offset", "0");
    console.log(
      `Scraped ${upserted} models (${matched} with stats, ${total - matched} without), ${errors} errors`,
    );
    return { scraped: upserted, total, errors };
  } catch (e) {
    console.error(
      "scrapeBatch top-level error:",
      e instanceof Error ? e.stack : e,
    );
    throw e;
  }
}
