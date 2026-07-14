-- SLF_FULL_MODEL_v1: Azure Postgres does not allow-list every extension (pg_trgm took the
-- BF app down on 2026-07-13). Never let an extension be fatal; gen_random_uuid() is core.
DO $ext$ BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'uuid-ossp unavailable, using gen_random_uuid()';
  END;
END $ext$;

CREATE TABLE IF NOT EXISTS slf_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT,
  business_unit TEXT NOT NULL DEFAULT 'SLF',
  product_family TEXT,
  borrower_name TEXT,
  amount NUMERIC,
  stage TEXT,
  status TEXT,
  funded_amount NUMERIC,
  funded_at TIMESTAMP,
  raw_payload JSONB,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  deleted_at TIMESTAMP NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_slf_deals_external_id
ON slf_deals(external_id);

CREATE TABLE IF NOT EXISTS slf_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE NOT NULL,
  request_hash TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  deleted_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS slf_deal_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES slf_deals(id) ON DELETE CASCADE,
  headers JSONB,
  ip TEXT,
  error TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  deleted_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS slf_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  last_sync TIMESTAMP,
  records_synced INTEGER,
  status TEXT,
  error TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  deleted_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS slf_monthly_commission_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_month DATE NOT NULL,
  total_commission NUMERIC,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  deleted_at TIMESTAMP NULL
);
