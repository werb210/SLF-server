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
// SLF_BROKER_SYNC_v1
// Verified against production with the Boreal Financial broker token, 15 Sep 2026:
// /api/credit/request/, /api/equipment-financing/request/ and /api/invoice/
// return { requests: [...], total, summary, allStates }; /api/factoring-bid/
// returns a bare array. The old reader only knew bare arrays and { results },
// so every envelope read as empty and the sync logged "synced: 0" forever.
const ITEM_KEYS = ["results", "requests"] as const;
export const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const OFFER_ONLY_FAMILIES = new Set(["factoring-bid"]);
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
function warnUnrecognised(family: string, url: string, data: unknown) {
  // Key names only - values can carry applicant PII.
  logger.warn(
    {
      family,
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
  const base = listUrlFor(productFamily);
  try {
    if (OFFER_ONLY_FAMILIES.has(productFamily)) {
      const { data } = await slfClient.get(base);
      const items = itemsOf(data);
      if (items === null) warnUnrecognised(productFamily, base, data);
      else if (items.length > 0)
        logger.warn(
          { family: productFamily, activeOffers: items.length },
          "SLF active factoring offers present but not yet stored",
        );
      markSuccess(st, now);
      logger.info(
        { family: productFamily, synced: 0, offersOnly: true },
        "SLF sync complete",
      );
      return 0;
    }

    let synced = 0;
    let complete = false;
    let reportedTotal: number | null = null;
    const seenIds: string[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${base}?page=${page}&page_size=${PAGE_SIZE}`;
      const { data } = await slfClient.get(url);
      const items = itemsOf(data);
      if (items === null) {
        warnUnrecognised(productFamily, url, data);
        break;
      }
      const t = totalOf(data);
      if (t !== null) reportedTotal = t;
      for (const item of items) {
        await ingestRequest(productFamily, item as Record<string, any>);
        const id = (item as { id?: unknown }).id;
        if (id != null) seenIds.push(String(id));
        synced += 1;
      }
      const lastPage =
        items.length === 0 ||
        items.length < PAGE_SIZE ||
        Array.isArray(data) ||
        (reportedTotal !== null && synced >= reportedTotal);
      if (lastPage) {
        complete = true;
        break;
      }
    }
    if (!complete || (reportedTotal !== null && reportedTotal > synced)) {
      logger.warn(
        { family: productFamily, reportedTotal, synced, complete },
        "SLF reported more records than were synced; stale records left in place",
      );
    } else {
      await retireMissing(productFamily, seenIds);
    }
    markSuccess(st, now);
    logger.info(
      { family: productFamily, synced, reportedTotal },
      "SLF sync complete",
    );
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

function markSuccess(st: ReturnType<typeof stateFor>, now: number) {
  st.lastSuccessfulSync = now;
  st.consecutiveFailures = 0;
  st.lastError = null;
  st.suspendedUntil = null;
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
