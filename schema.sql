CREATE TABLE IF NOT EXISTS models (
  chute_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  latest_tps REAL DEFAULT 0,
  latest_ttft REAL DEFAULT 0,
  latest_requests INTEGER DEFAULT 0,
  avg_7d REAL DEFAULT 0,
  avg_30d REAL DEFAULT 0,
  peak_tps REAL DEFAULT 0,
  latest_date TEXT,
  scraped_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO meta (key, value) VALUES ('batch_offset', '0');
