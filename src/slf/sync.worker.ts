import cron from "node-cron"
import { logger } from "../platform/logger"
import { allowedFamilies, env } from "../config/env"
import { pool } from "../db/pool"
import { redactAxiosError } from "../platform/redactAxios"
import { syncFamily } from "./sync.service"

// SLF_SYNC_LOCK_v789 - the cron and POST /api/slf/sync used to run syncs side by
// side (and so did two app instances), racing on the same rows and on
// retireMissing. A session-level advisory lock is held for the whole run; it is
// taken and released on the same pooled client, because an advisory lock
// belongs to the connection that took it.
// Arbitrary, but fixed: the bytes of "SLFSYNC".
export const SYNC_LOCK_KEY = "23446287996767811"

export type ExclusiveSyncOutcome = { ran: boolean }

export async function syncAllFamilies(force = false) {
  logger.info({ force, families: allowedFamilies }, "Running SLF sync")
  for (const family of allowedFamilies) {
    const run = await pool.query<{ id: string }>(
      `INSERT INTO slf_sync_runs (product_family, status) VALUES ($1,'running') RETURNING id`,
      [family],
    )
    const id = run.rows[0].id
    try {
      const result = await syncFamily(family, { force })
      if (result.status === "skipped") {
        await pool.query(
          `UPDATE slf_sync_runs SET status='skipped', records=0, error=$2, finished_at=now() WHERE id=$1`,
          [id, result.reason],
        )
      } else {
        await pool.query(
          `UPDATE slf_sync_runs SET status='success', records=$2, finished_at=now() WHERE id=$1`,
          [id, result.records],
        )
      }
    } catch (rawError: unknown) {
      const error = redactAxiosError(rawError)
      const message = error instanceof Error ? error.message : "Unknown sync error"
      // SLF_REDACT_v1 - logging the axios error serialises config.headers,
      // which carries the bearer token. It has been written to Azure log
      // files in plaintext on every failure. Log the status and detail only.
      logger.error({ family, status: (error as { status?: number })?.status, detail: message }, "SLF family sync failed")
      await pool.query(
        `UPDATE slf_sync_runs SET status='failed', records=0, error=$2, finished_at=now() WHERE id=$1`,
        [id, message],
      )
    }
  }
}

/** Run a full sync unless another one (this process or another) holds the lock. */
export async function runExclusiveSync(force = false): Promise<ExclusiveSyncOutcome> {
  const client = await pool.connect()
  let releaseError: Error | undefined
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock($1::bigint) AS locked`,
      [SYNC_LOCK_KEY],
    )
    if (!rows[0]?.locked) {
      logger.info({ force }, "SLF sync already running; skipped")
      return { ran: false }
    }
    try {
      await syncAllFamilies(force)
    } finally {
      try {
        await client.query(`SELECT pg_advisory_unlock($1::bigint)`, [SYNC_LOCK_KEY])
      } catch (err) {
        // If the unlock failed the session may still hold the lock. Destroy the
        // connection rather than return it to the pool, which ends the session
        // and with it the lock.
        releaseError = err instanceof Error ? err : new Error("advisory unlock failed")
        logger.error({ detail: releaseError.message }, "SLF sync lock release failed")
      }
    }
    return { ran: true }
  } finally {
    client.release(releaseError)
  }
}

export function startSyncWorker() {
  const m = Number(env.SYNC_INTERVAL_MINUTES)
  const tick = async () => {
    try {
      await runExclusiveSync(false)
    } catch (err) {
      logger.error({ detail: err instanceof Error ? err.message : String(err) }, "SLF scheduled sync failed")
    }
  }
  cron.schedule(`*/${Number.isFinite(m) && m > 0 ? m : 10} * * * *`, tick)
  void tick()
}
