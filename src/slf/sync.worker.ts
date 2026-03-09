import cron from "node-cron"
import { logger } from "../lib/logger"

export async function syncAllFamilies(force = false) {
  logger.info({ force }, "Running SLF sync worker")
}

export function startSyncWorker() {
  cron.schedule("*/10 * * * *", async () => {
    await syncAllFamilies(false)
  })
}
