// SLF_FULL_MODEL_v1
import { logger } from "../platform/logger"
import { calculateBackoff } from "./backoff"
import { slfClient } from "./client"
import { stateFor } from "./slf.state"
import { ingestRequest } from "./ingest"
function getErrorMessage(err: unknown): string { if (typeof err === "object" && err !== null && "response" in err) { const r = (err as { response?: { status?: number; data?: unknown } }).response; if (r) return `HTTP ${r.status ?? "?"}: ${JSON.stringify(r.data).slice(0, 300)}` } if (err instanceof Error) return err.message; return "Unknown SLF sync error" }
function itemsOf(data: unknown): Record<string, unknown>[] { if (Array.isArray(data)) return data as Record<string, unknown>[]; if (data && typeof data === "object" && Array.isArray((data as { results?: unknown[] }).results)) return (data as { results: Record<string, unknown>[] }).results; return [] }
// SLF_SYNC_LIST_URL_v1 - not every product family exposes /request/. Per the
// SLF OpenAPI spec, credit and equipment-financing do, but factoring-bid and
// invoice are served from their bare collection path. Requesting
// /api/factoring-bid/request/ or /api/invoice/request/ 404s, which tripped the
// failure counter and suspended those families via backoff.
const FAMILY_LIST_URL: Record<string, string> = {
  "credit": "/api/credit/request/",
  "equipment-financing": "/api/equipment-financing/request/",
  "factoring-bid": "/api/factoring-bid/",
  "invoice": "/api/invoice/"
}
export function listUrlFor(productFamily: string): string {
  return FAMILY_LIST_URL[productFamily] ?? `/api/${productFamily}/request/`
}
export async function syncFamily(productFamily: string): Promise<number> { const st = stateFor(productFamily); const now = Date.now(); if (st.suspendedUntil && now < st.suspendedUntil) { logger.warn(`SLF ${productFamily} suspended until ${new Date(st.suspendedUntil).toISOString()}`); return 0 } let url: string | null = listUrlFor(productFamily); let synced = 0; try { while (url) { const resp: { data: unknown } = await slfClient.get(url); const data: unknown = resp.data; for (const item of itemsOf(data)) { await ingestRequest(productFamily, item as Record<string, any>); synced += 1 } const nextUrl: string | null = data && typeof data === "object" ? ((data as { next?: string | null }).next ?? null) : null; url = nextUrl ? nextUrl.replace(String(slfClient.defaults.baseURL ?? ""), "") : null } st.lastSuccessfulSync = now; st.consecutiveFailures = 0; st.lastError = null; st.suspendedUntil = null; logger.info({ family: productFamily, synced }, "SLF sync complete"); return synced } catch (err: unknown) { st.consecutiveFailures += 1; st.lastError = getErrorMessage(err); const backoff = calculateBackoff(st.consecutiveFailures); st.suspendedUntil = now + backoff; logger.error({ family: productFamily, err: st.lastError }, `SLF sync failed; backing off ${backoff / 1000}s`); throw err } }
