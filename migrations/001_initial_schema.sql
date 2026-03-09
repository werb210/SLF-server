CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS slf_deals (
  uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  idempotency_key TEXT UNIQUE NOT NULL,
  request_hash TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  deleted_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS slf_deal_logs (
  uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_uuid UUID REFERENCES slf_deals(uuid) ON DELETE CASCADE,
  headers JSONB,
  ip TEXT,
  error TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  deleted_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS slf_sync_log (
  uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  last_sync TIMESTAMP,
  records_synced INTEGER,
  status TEXT,
  error TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  deleted_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS slf_monthly_commission_snapshots (
  uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snapshot_month DATE NOT NULL,
  total_commission NUMERIC,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  deleted_at TIMESTAMP NULL
);
