-- SLF_RETIRE_STALE_v1
-- The mirror was insert-or-update only, so rows that vanish upstream -- or that
-- came from a different SLF environment before SLF_BASE_URL was repointed --
-- persisted indefinitely and kept rendering on the staff pipeline.
ALTER TABLE slf_requests ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS slf_requests_live_idx
  ON slf_requests (product_family) WHERE retired_at IS NULL;
