import { pool } from "./index"

export async function runSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS slf_deals (
      uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      external_id TEXT UNIQUE,
      business_unit TEXT NOT NULL DEFAULT 'SLF',
      product_family TEXT NOT NULL,
      raw_payload JSONB NOT NULL,
      borrower_name TEXT,
      amount NUMERIC,
      status TEXT DEFAULT 'new',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP NULL
    );

    CREATE TABLE IF NOT EXISTS slf_idempotency (
      uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      idempotency_key TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP NULL
    );

    CREATE TABLE IF NOT EXISTS slf_logs (
      uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_type TEXT,
      entity_uuid UUID,
      event_type TEXT,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP NULL
    );
  `)
}
