CREATE TABLE sources_registry (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('IA','GAMING','CREATORS','TECH_BIZ')),
  feed_url TEXT NOT NULL,
  feed_type TEXT NOT NULL CHECK(feed_type IN ('RSS_LIGHT','REDDIT_JSON','HN_JSON')),
  last_fetched_at_ms INTEGER DEFAULT 0,
  consecutive_failures INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE radar_items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  category TEXT NOT NULL,
  post_type TEXT NOT NULL CHECK(post_type IN ('VIRAL_NATIVE','WEB_BRIDGE','AGENCY_PROMO')),
  source_url TEXT NOT NULL,
  url_hash TEXT NOT NULL UNIQUE,
  title_fingerprint TEXT NOT NULL,
  raw_title TEXT NOT NULL,
  raw_facts_json TEXT NOT NULL,
  media_source_type TEXT CHECK(media_source_type IN ('OWNED','CC_VERIFIED','NONE')),
  media_source_url TEXT,
  telegram_caption TEXT,
  voiceover_script TEXT,
  instagram_fb_caption TEXT,
  youtube_short_meta_json TEXT,
  linkedin_post TEXT,
  web_slug TEXT UNIQUE,
  web_article_html TEXT,
  poll_question TEXT,
  poll_options_json TEXT,
  processed_media_url TEXT,
  status TEXT NOT NULL DEFAULT 'DISCOVERED'
    CHECK(status IN ('DISCOVERED','RENDERING','READY_FOR_REVIEW','PUBLISHED','REJECTED','FAILED')),
  source_http_status INTEGER DEFAULT 0,
  controversy_score INTEGER DEFAULT 0,
  ai_provider_used TEXT,
  telegram_message_id INTEGER,
  delete_after_ms INTEGER,
  discovered_at_ms INTEGER NOT NULL,
  published_at_ms INTEGER
);

CREATE INDEX idx_radar_status_score ON radar_items(status, controversy_score DESC);
CREATE INDEX idx_radar_delete_after ON radar_items(delete_after_ms) WHERE delete_after_ms IS NOT NULL;
CREATE INDEX idx_radar_title_fp ON radar_items(title_fingerprint);

CREATE TABLE system_budget_ledger (
  year_month TEXT PRIMARY KEY,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  estimated_cost_usd_micros INTEGER DEFAULT 0,
  hard_limit_usd_micros INTEGER DEFAULT 1500000,
  d1_writes_today INTEGER DEFAULT 0,
  d1_writes_date TEXT,
  github_actions_minutes_month INTEGER DEFAULT 0,
  circuit_breaker_tripped INTEGER DEFAULT 0,
  updated_at_ms INTEGER NOT NULL
);
INSERT INTO system_budget_ledger (year_month, updated_at_ms) VALUES ('2026-10', 0);

CREATE TABLE system_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at_ms INTEGER
);
INSERT INTO system_state (key, value, updated_at_ms) VALUES ('backup_expected', '0', 0);
INSERT INTO system_state (key, value, updated_at_ms) VALUES ('last_backup_at_ms', '0', 0);
INSERT INTO system_state (key, value, updated_at_ms) VALUES ('cpu_unit_confirmed', '0', 0);

CREATE TABLE job_runs (
  id TEXT PRIMARY KEY,
  job TEXT NOT NULL,
  started_at_ms INTEGER NOT NULL,
  status TEXT NOT NULL,
  items_seen INTEGER DEFAULT 0,
  items_new INTEGER DEFAULT 0,
  d1_statements INTEGER DEFAULT 0,
  rows_written INTEGER DEFAULT 0,
  error TEXT
);
CREATE INDEX idx_job_runs_job_time ON job_runs(job, started_at_ms DESC);

CREATE TABLE metrics_daily (
  day TEXT NOT NULL,
  worker TEXT NOT NULL,
  cpu_p50_raw REAL,
  cpu_p99_raw REAL,
  cpu_p99_ms REAL,
  unit_confirmed INTEGER NOT NULL DEFAULT 0,
  requests INTEGER,
  errors INTEGER,
  PRIMARY KEY (day, worker)
);

