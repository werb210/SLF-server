// SLF_SYNC_STATUS_v1
// The portal reads the mirror tables directly, so a family stuck in backoff
// renders exactly like a family with no deals. This has been failing since
// before the last restart with nothing to show for it.
import { Router } from "express"
import { pool } from "../db/pool"
import { allowedFamilies } from "../config/env"
import { stateFor } from "../slf/slf.state"

const router = Router()

router.get("/sync-status", async (_req, res) => {
  const { rows } = await pool.query<{
    product_family: string; status: string; records: number; error: string | null; finished_at: string | null
  }>(
    `SELECT DISTINCT ON (product_family) product_family, status, records, error, finished_at
       FROM slf_sync_runs ORDER BY product_family, started_at DESC`,
  ).catch(() => ({ rows: [] as never[] }))

  const byFamily = new Map(rows.map((r) => [r.product_family, r]))
  res.json({
    families: allowedFamilies.map((family) => {
      const last = byFamily.get(family)
      const st = stateFor(family)
      return {
        family,
        healthy: last?.status === "success",
        lastStatus: last?.status ?? "never_run",
        lastRecords: last?.records ?? 0,
        lastError: last?.error ?? null,
        lastFinishedAt: last?.finished_at ?? null,
        consecutiveFailures: st.consecutiveFailures,
        suspendedUntil: st.suspendedUntil ? new Date(st.suspendedUntil).toISOString() : null,
      }
    }),
  })
})

export default router
