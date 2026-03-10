import cron from "node-cron"
import { logger } from "../lib/logger"
import { allowedFamilies, env } from "../config/env"
import { pool } from "../db/pool"
import { syncFamily } from "./sync.service"

async function writeSyncLog(recordsSynced: number, status: string, error: string | null = null) {
  await pool.query(
    "INSERT INTO slf_sync_log (last_sync, records_synced, status, error) VALUES (NOW(), $1, $2, $3)",
    [recordsSynced, status, error]
  )
}

export async function syncAllFamilies(force = false) {
  logger.info({ force, families: allowedFamilies }, "Running SLF sync worker")

  for (const family of allowedFamilies) {
    try {
      const recordsSynced = await syncFamily(family)
      await writeSyncLog(recordsSynced, "success", null)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown sync worker error"
      logger.error({ family, error }, "SLF family sync failed")
      await writeSyncLog(0, "failed", `${family}: ${message}`)
    }
  }
}

export function startSyncWorker() {
  const intervalMinutes = Number(env.SYNC_INTERVAL_MINUTES)
  const cronSchedule = `*/${Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : 10} * * * *`

  cron.schedule(cronSchedule, async () => {
    await syncAllFamilies(false)
  })
}
