-- SLF_FULL_MODEL_v1
-- Captures EVERY field the SLF API returns, relationally, plus the raw payload.
-- Derived from a real QA /api/credit/request/ response (request 39, SunVolt Electric).
-- gen_random_uuid() is core in PG13+ (no extension; Azure does not allow-list many).
SET search_path = public, pg_catalog;

CREATE TABLE IF NOT EXISTS slf_users (
  id               BIGINT PRIMARY KEY,
  email            TEXT,
  first_name       TEXT,
  last_name        TEXT,
  phone_number     TEXT,
  role             TEXT,
  sub_id           BIGINT,
  raw              JSONB,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slf_subs (
  id                          BIGINT PRIMARY KEY,
  company_name                TEXT,
  gst                         TEXT,
  employee_count              INTEGER,
  address                     TEXT,
  city                        TEXT,
  province                    TEXT,
  postal_code                 TEXT,
  country                     TEXT,
  website                     TEXT,
  sub_trade                   TEXT[],
  is_union                    BOOLEAN,
  sub_contracting             BOOLEAN,
  ed_sub                      BOOLEAN,
  is_approved                 BOOLEAN,
  partnership                 TEXT,
  notes                       TEXT,
  business_bankruptcy         BOOLEAN,
  personal_bankruptcy         BOOLEAN,
  company_start               DATE,
  admin_user_id               BIGINT,
  applicant_user_id           BIGINT,
  applicant_job_title         TEXT,
  applicant_ownership_percent NUMERIC,
  applicant_invited           TIMESTAMPTZ,
  applicant_form_completed    BOOLEAN,
  requested_documents         JSONB,
  required_documents          JSONB,
  slf_updated_at              TIMESTAMPTZ,
  raw                         JSONB,
  first_seen_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slf_requests (
  id                        BIGINT PRIMARY KEY,
  product_family            TEXT NOT NULL,
  sub_id                    BIGINT,
  amount                    NUMERIC,
  notes                     TEXT,
  country                   TEXT,
  is_active                 BOOLEAN,
  is_complete               BOOLEAN,
  hidden                    BOOLEAN,
  offered                   BOOLEAN,
  ongoing_loc_count         INTEGER,
  ongoing_loc_total         NUMERIC,
  equipment_finance_request JSONB,
  stage                     TEXT,
  raw                       JSONB,
  first_seen_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_slf_requests_sub    ON slf_requests(sub_id);
CREATE INDEX IF NOT EXISTS idx_slf_requests_stage  ON slf_requests(stage);
CREATE INDEX IF NOT EXISTS idx_slf_requests_family ON slf_requests(product_family);

CREATE TABLE IF NOT EXISTS slf_contracts (
  id                 BIGINT PRIMARY KEY,
  request_id         BIGINT,
  sub_id             BIGINT,
  contract_number    TEXT,
  amount             NUMERIC,
  general_contractor TEXT,
  holdback_percent   NUMERIC,
  notes              TEXT,
  country            TEXT,
  is_verified        BOOLEAN,
  change_orders      JSONB,
  raw                JSONB,
  last_synced_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_slf_contracts_request ON slf_contracts(request_id);

CREATE TABLE IF NOT EXISTS slf_offers (
  id                     BIGINT PRIMARY KEY,
  request_id             BIGINT,
  amount                 NUMERIC,
  status                 TEXT,
  reject_reason          TEXT,
  notes                  TEXT,
  original_interest_rate NUMERIC,
  interest_rate_type     TEXT,
  lender_id              BIGINT,
  lender_name            TEXT,
  lender_logo            TEXT,
  ended                  BOOLEAN,
  end_date               TIMESTAMPTZ,
  is_active              BOOLEAN,
  slf_created_at         TIMESTAMPTZ,
  raw                    JSONB,
  last_synced_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_slf_offers_request ON slf_offers(request_id);
CREATE INDEX IF NOT EXISTS idx_slf_offers_lender  ON slf_offers(lender_id);

CREATE TABLE IF NOT EXISTS slf_files (
  id             BIGINT NOT NULL,
  owner_kind     TEXT   NOT NULL,
  owner_id       BIGINT NOT NULL,
  request_id     BIGINT,
  file_url       TEXT,
  file_type      TEXT,
  size_bytes     BIGINT,
  start_date     DATE,
  end_date       DATE,
  uploaded_at    TIMESTAMPTZ,
  raw            JSONB,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, owner_kind, owner_id)
);
CREATE INDEX IF NOT EXISTS idx_slf_files_request ON slf_files(request_id);
CREATE INDEX IF NOT EXISTS idx_slf_files_owner   ON slf_files(owner_kind, owner_id);
CREATE INDEX IF NOT EXISTS idx_slf_files_type    ON slf_files(file_type);

CREATE TABLE IF NOT EXISTS slf_sync_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_family TEXT,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ,
  status         TEXT,
  records        INTEGER,
  error          TEXT
);
CREATE INDEX IF NOT EXISTS idx_slf_sync_runs_started ON slf_sync_runs(started_at DESC);
