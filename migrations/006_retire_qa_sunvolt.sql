-- SLF_RETIRE_QA_SUNVOLT_v1
-- SunVolt Electric (Factoring Bid, $150,000) was synced from the SLF QA host
-- before SLF_BASE_URL pointed at production. Production /api/factoring-bid/
-- returns [], and retireMissing() deliberately retires nothing on an empty
-- family, so this QA row would render on the staff pipeline indefinitely.
-- Soft retire only: raw payload, files, and contracts are kept, and the row
-- revives automatically if production SLF ever returns it.
UPDATE slf_requests r
   SET retired_at = now()
 WHERE r.retired_at IS NULL
   AND (
         lower(btrim(r.company_name)) = 'sunvolt electric'
      OR r.sub_id IN (SELECT s.id FROM slf_subs s
                       WHERE lower(btrim(s.company_name)) = 'sunvolt electric')
   );
