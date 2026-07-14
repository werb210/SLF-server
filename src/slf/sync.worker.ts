import cron from "node-cron"
import { logger } from "../platform/logger"
import { allowedFamilies, env } from "../config/env"
import { pool } from "../db/pool"
import { syncFamily } from "./sync.service"
export async function syncAllFamilies(force = false) { logger.info({ force, families: allowedFamilies }, "Running SLF sync"); for (const family of allowedFamilies) { const run = await pool.query<{ id: string }>(`INSERT INTO slf_sync_runs (product_family, status) VALUES ($1,'running') RETURNING id`, [family]); const id = run.rows[0].id; try { const records = await syncFamily(family); await pool.query(`UPDATE slf_sync_runs SET status='success', records=$2, finished_at=now() WHERE id=$1`, [id, records]) } catch (error: unknown) { const message = error instanceof Error ? error.message : "Unknown sync error"; logger.error({ family, error }, "SLF family sync failed"); await pool.query(`UPDATE slf_sync_runs SET status='failed', records=0, error=$2, finished_at=now() WHERE id=$1`, [id, message]) } } }
export function startSyncWorker() { const m = Number(env.SYNC_INTERVAL_MINUTES); cron.schedule(`*/${Number.isFinite(m) && m > 0 ? m : 10} * * * *`, async () => { await syncAllFamilies(false) }); void syncAllFamilies(false) }
