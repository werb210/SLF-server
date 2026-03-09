CREATE TABLE IF NOT EXISTS slf_sync_log (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  last_sync TIMESTAMP DEFAULT NOW(),
  records_synced INTEGER DEFAULT 0,
  status TEXT,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP NULL
);
