// SLF_FULL_MODEL_v1
import { logger } from "../platform/logger";
import { calculateBackoff } from "./backoff";
import { slfClient } from "./client";
import { stateFor } from "./slf.state";
import { ingestRequest } from "./ingest";
// SLF_RETIRE_STALE_v1
import { pool } from "../db/pool";
function getErrorMessage(err: unknown): string {
  // SLF_REDACT_v1 - response body only; never the request config, which
  // carries Authorization.
  if (typeof err === "object" && err !== null && "response" in err) {
    const r = (err as { response?: { status?: number; data?: unknown } })
      .response;
    if (r)
      return `HTTP ${r.status ?? "?"}: ${JSON.stringify(r.data).slice(0, 300)}`;
  }
  if (err instanceof Error) return err.message;
  return "Unknown SLF sync error";
}
// SLF_REQUESTS_ENVELOPE_v1 - production SLF does not use DRF's { results }.
// /api/credit/request/, /api/equipment-financing/request/ and /api/invoice/
// return { requests: [...], total, summary, allStates }; /api/factoring-bid/
// returns a bare array. The old reader only knew bare arrays and { results },
// so every envelope read as empty and the sync logged "synced: 0" forever.
const ITEM_KEYS = ["results", "requests"] as const;
export function itemsOf(data: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    for (const k of ITEM_KEYS) {
      const v = (data as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return null; // unrecognised - caller must warn, never treat as empty
}
function totalOf(data: unknown): number | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as { total?: unknown; count?: unknown };
  const t = typeof d.total === "number" ? d.total : d.count;
  return typeof t === "number" && Number.isFinite(t) ? t : null;
}
// SLF_SYNC_LIST_URL_v1 - not every product family exposes /request/. Per the
// SLF OpenAPI spec, credit and equipment-financing do, but factoring-bid and
// invoice are served from their bare collection path. Requesting
// /api/factoring-bid/request/ or /api/invoice/request/ 404s, which tripped the
// failure counter and suspended those families via backoff.
const FAMILY_LIST_URL: Record<string, string> = {
  credit: "/api/credit/request/",
  "equipment-financing": "/api/equipment-financing/request/",
  "factoring-bid": "/api/factoring-bid/",
  invoice: "/api/invoice/",
};
export function listUrlFor(productFamily: string): string {
  return FAMILY_LIST_URL[productFamily] ?? `/api/${productFamily}/request/`;
}
export async function syncFamily(productFamily: string): Promise<number> {
  const st = stateFor(productFamily);
  const now = Date.now();
  if (st.suspendedUntil && now < st.suspendedUntil) {
    logger.warn(
      `SLF ${productFamily} suspended until ${new Date(st.suspendedUntil).toISOString()}`,
    );
    return 0;
  }
  let url: string | null = listUrlFor(productFamily);
  let synced = 0;
  let reportedTotal: number | null = null;
  const seenIds: string[] = [];
  try {
    while (url) {
      const resp: { data: unknown } = await slfClient.get(url);
      const data: unknown = resp.data;
      const items = itemsOf(data);
      if (items === null) {
        // Key names only - values can carry applicant PII.
        logger.warn(
          {
            family: productFamily,
            url,
            shape: Array.isArray(data) ? "array" : typeof data,
            keys:
              data && typeof data === "object"
                ? Object.keys(data as object).slice(0, 20)
                : [],
          },
          "SLF response envelope not recognised; ingested nothing from this page",
        );
      }
      const pageTotal = totalOf(data);
      if (pageTotal !== null) reportedTotal = pageTotal;
      for (const item of items ?? []) {
        await ingestRequest(productFamily, item as Record<string, any>);
        const seenId = (item as { id?: unknown }).id;
        if (seenId != null) seenIds.push(String(seenId));
        synced += 1;
      }
      const nextUrl: string | null =
        data && typeof data === "object"
          ? ((data as { next?: string | null }).next ?? null)
          : null;
      url = nextUrl
        ? nextUrl.replace(String(slfClient.defaults.baseURL ?? ""), "")
        : null;
    }
    if (reportedTotal !== null && reportedTotal > synced) {
      // SLF reported more rows than we walked - pagination we don't follow.
      logger.warn(
        { family: productFamily, reportedTotal, synced },
        "SLF reported more records than were synced",
      );
    }
    await retireMissing(productFamily, seenIds);
    st.lastSuccessfulSync = now;
    st.consecutiveFailures = 0;
    st.lastError = null;
    st.suspendedUntil = null;
    logger.info({ family: productFamily, synced }, "SLF sync complete");
    return synced;
  } catch (err: unknown) {
    st.consecutiveFailures += 1;
    st.lastError = getErrorMessage(err);
    const backoff = calculateBackoff(st.consecutiveFailures);
    st.suspendedUntil = now + backoff;
    logger.error(
      { family: productFamily, err: st.lastError },
      `SLF sync failed; backing off ${backoff / 1000}s`,
    );
    throw err;
  }
}

// SLF_RETIRE_STALE_v1
// Only ever called after a family paged to completion without throwing, so a
// mid-sync failure cannot retire live records. An empty response retires
// nothing: SLF legitimately returns zero rows for a family with no deals, and
// wiping the board on a transient empty page would be worse than a stale row.
export async function retireMissing(
  productFamily: string,
  seenIds: string[],
): Promise<number> {
  if (seenIds.length === 0) return 0;
  const { rowCount } = await pool.query(
    `UPDATE slf_requests SET retired_at = now()
      WHERE product_family = $1 AND retired_at IS NULL AND id::text <> ALL($2::text[])`,
    [productFamily, seenIds],
  );
  if (rowCount)
    logger.info(
      { family: productFamily, retired: rowCount },
      "SLF retired stale records",
    );
  return rowCount ?? 0;
}
