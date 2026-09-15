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
// SLF_FAMILY_KEY_v1 - broker deal flow comes from one combined endpoint.
type Item = Record<string, unknown>;
export const ALL_REQUESTS_URL = "/api/fininst/requests/";
export const FACTORING_OFFERS_URL = "/api/factoring-bid/";
export const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const CACHE_MS = 60_000;

export function itemsOf(data: unknown): Item[] | null {
  if (Array.isArray(data)) return data as Item[];
  if (data && typeof data === "object")
    for (const key of ["results", "requests"]) {
      const value = (data as Item)[key];
      if (Array.isArray(value)) return value as Item[];
    }
  return null;
}
function totalOf(data: unknown): number | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as { total?: unknown; count?: unknown };
  const total = typeof d.total === "number" ? d.total : d.count;
  return typeof total === "number" && Number.isFinite(total) ? total : null;
}
const has = (item: Item, key: string) =>
  Object.prototype.hasOwnProperty.call(item, key);
export function classifyRequest(item: Item): string | null {
  if (has(item, "invoiceNumber")) return "invoice";
  if (["reason", "terms", "quoteFile", "poFile"].some((key) => has(item, key)))
    return "equipment-financing";
  if (has(item, "equipmentFinanceRequest") || has(item, "notes"))
    return "credit";
  return null;
}
function keysOnly(data: unknown): string[] {
  return data && typeof data === "object"
    ? Object.keys(data as object).slice(0, 20)
    : [];
}
type Snapshot = {
  byFamily: Map<string, Item[]>;
  complete: boolean;
  total: number | null;
};
let cache: { at: number; snap: Snapshot } | null = null;
export function resetRequestCache() {
  cache = null;
}
async function loadAllRequests(): Promise<Snapshot> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.snap;
  const byFamily = new Map<string, Item[]>();
  let complete = false,
    total: number | null = null,
    read = 0,
    unknown = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${ALL_REQUESTS_URL}?page=${page}&page_size=${PAGE_SIZE}`;
    const { data } = await slfClient.get(url);
    const items = itemsOf(data);
    if (items === null) {
      logger.warn(
        { url, keys: keysOnly(data) },
        "SLF response envelope not recognised",
      );
      break;
    }
    const reported = totalOf(data);
    if (reported !== null) total = reported;
    for (const item of items) {
      read++;
      const family = classifyRequest(item);
      if (!family) {
        unknown++;
        logger.warn(
          { slfId: item.id, keys: keysOnly(item) },
          "SLF request type not recognised; not ingested",
        );
        continue;
      }
      const familyItems = byFamily.get(family) ?? [];
      familyItems.push(item);
      byFamily.set(family, familyItems);
    }
    if (
      items.length === 0 ||
      items.length < PAGE_SIZE ||
      Array.isArray(data) ||
      (total !== null && read >= total)
    ) {
      complete = true;
      break;
    }
  }
  if ((total !== null && read < total) || unknown > 0) complete = false;
  const snap = { byFamily, complete, total };
  cache = { at: Date.now(), snap };
  return snap;
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
  try {
    if (productFamily === "factoring-bid") {
      const { data } = await slfClient.get(FACTORING_OFFERS_URL);
      const items = itemsOf(data);
      if (items === null)
        logger.warn(
          { url: FACTORING_OFFERS_URL, keys: keysOnly(data) },
          "SLF response envelope not recognised",
        );
      else if (items.length)
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
    const snap = await loadAllRequests();
    const mine = snap.byFamily.get(productFamily) ?? [];
    const seenIds: string[] = [];
    for (const item of mine) {
      await ingestRequest(productFamily, item as Record<string, any>);
      if (item.id != null) seenIds.push(String(item.id));
    }
    if (snap.complete) await retireMissing(productFamily, seenIds);
    else
      logger.warn(
        { family: productFamily, total: snap.total },
        "SLF request list not fully read; stale records left in place",
      );
    markSuccess(st, now);
    logger.info(
      { family: productFamily, synced: mine.length, total: snap.total },
      "SLF sync complete",
    );
    return mine.length;
  } catch (err: unknown) {
    cache = null;
    st.consecutiveFailures++;
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
      WHERE product_family = $1 AND retired_at IS NULL AND slf_id::text <> ALL($2::text[])`,
    [productFamily, seenIds],
  );
  if (rowCount)
    logger.info(
      { family: productFamily, retired: rowCount },
      "SLF retired stale records",
    );
  return rowCount ?? 0;
}
