import { getMeta, setMeta, upsertModel } from "./db";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const BATCH_SIZE = 5;

async function timed(url: string) {
  console.log(`Fetching: ${url}`);
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), 30_000);
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: ctrl.signal,
  });
  clearTimeout(id);
  const text = await res.text();
  console.log(`Fetched ${url} status=${res.status} length=${text.length}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return text;
}

export async function fetchCatalogue() {
  const html = await timed("https://chutes.ai/app");
  console.log(`Catalogue HTML length: ${html.length}`);

  const pattern = /chute_id:"([a-f0-9-]+)",name:"([^"]+)"/g;
  const positions: { id: string; name: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null)
    positions.push({ id: m[1], name: m[2], index: m.index });

  console.log(`Found ${positions.length} chute_id positions`);

  const seen = new Set<string>();
  const items: { chute_id: string; name: string }[] = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].index;
    const end =
      i + 1 < positions.length ? positions[i + 1].index : start + 2000;
    if (
      html.slice(start, end).includes('standard_template:"vllm"') &&
      !seen.has(positions[i].id)
    ) {
      seen.add(positions[i].id);
      items.push({ chute_id: positions[i].id, name: positions[i].name });
    }
  }

  console.log(`Found ${items.length} vLLM models after filtering`);
  return items;
}

export async function fetchModelStats(chuteId: string) {
  const html = await timed(`https://chutes.ai/app/chute/${chuteId}?tab=stats`);
  const regex = new RegExp(
    `chute_id:"${chuteId}",name:"([^"]+)",date:"([^"]+)",total_requests:(\\d+),total_input_tokens:(\\d+),total_output_tokens:(\\d+),average_tps:([0-9.eE+-]+),average_ttft:([0-9.eE+-]+)`,
    "g",
  );
  const rows: {
    name: string;
    date: string;
    requests: number;
    tps: number;
    ttft: number;
  }[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null)
    rows.push({
      name: m[1],
      date: m[2],
      requests: parseInt(m[3]),
      tps: parseFloat(m[6]),
      ttft: parseFloat(m[7]),
    });

  console.log(`Stats for ${chuteId}: ${rows.length} rows parsed`);

  rows.sort((a, b) => b.date.localeCompare(a.date));
  if (rows.length === 0) return null;
  const latest = rows[0];
  const avg = (arr: typeof rows) =>
    arr.length ? arr.reduce((s, r) => s + r.tps, 0) / arr.length : 0;
  const peak = rows.reduce((a, b) => (a.tps > b.tps ? a : b));
  return {
    chute_id: chuteId,
    name: latest.name,
    latest_tps: latest.tps,
    latest_ttft: latest.ttft,
    latest_requests: latest.requests,
    avg_7d: avg(rows.slice(0, 7)),
    avg_30d: avg(rows.slice(0, 30)),
    peak_tps: peak.tps,
    latest_date: latest.date,
  };
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

    const raw = await getMeta(db, "batch_offset");
    const offset = Math.min(parseInt(raw ?? "0") || 0, total - 1);
    const batch = catalogue.slice(offset, offset + BATCH_SIZE);
    console.log(
      `Processing batch: offset=${offset} size=${batch.length} total=${total}`,
    );

    const now = new Date().toISOString();
    let errors = 0;
    const results: (Awaited<ReturnType<typeof fetchModelStats>> | null)[] = [];
    for (const model of batch) {
      try {
        const stats = await fetchModelStats(model.chute_id);
        results.push(stats);
      } catch (e) {
        console.error(`Failed ${model.name} (${model.chute_id}):`, e);
        errors++;
        results.push(null);
      }
    }

    for (const stats of results) {
      if (!stats) continue;
      try {
        await upsertModel(db, { ...stats, scraped_at: now });
      } catch (e) {
        console.error(`DB upsert failed ${stats.name}:`, e);
        errors++;
      }
    }

    const next = offset + BATCH_SIZE >= total ? 0 : offset + BATCH_SIZE;
    await setMeta(db, "batch_offset", String(next));
    const scraped = results.filter(Boolean).length;
    console.log(
      `Scraped ${scraped}/${batch.length} (offset ${offset}->${next}, total ${total})`,
    );
    return { scraped, total, errors };
  } catch (e) {
    console.error(
      "scrapeBatch top-level error:",
      e instanceof Error ? e.stack : e,
    );
    throw e;
  }
}
