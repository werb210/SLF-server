-- SLF_FAMILY_ALIGNMENT_v1
-- Store per-field fallback values for SLF families that do not use the credit
-- request shape (for example invoice/factoring bids with invoices[] and
-- request-level files).
SET search_path = public, pg_catalog;

ALTER TABLE slf_requests ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE slf_requests ADD COLUMN IF NOT EXISTS external_status TEXT;
ALTER TABLE slf_requests ADD COLUMN IF NOT EXISTS lender_name TEXT;
ALTER TABLE slf_requests ADD COLUMN IF NOT EXISTS lender_logo TEXT;
ALTER TABLE slf_requests ADD COLUMN IF NOT EXISTS invoice_total NUMERIC;
ALTER TABLE slf_requests ADD COLUMN IF NOT EXISTS invoice_count INTEGER;
ALTER TABLE slf_requests ADD COLUMN IF NOT EXISTS advance_rate NUMERIC;
ALTER TABLE slf_requests ADD COLUMN IF NOT EXISTS advance_amount NUMERIC;
ALTER TABLE slf_requests ADD COLUMN IF NOT EXISTS discount_rate NUMERIC;
ALTER TABLE slf_requests ADD COLUMN IF NOT EXISTS holdback_percent NUMERIC;
ALTER TABLE slf_requests ADD COLUMN IF NOT EXISTS net_amount NUMERIC;

CREATE INDEX IF NOT EXISTS idx_slf_requests_company_name ON slf_requests(company_name);
