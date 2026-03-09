import cron from "node-cron"
import { logger } from "../lib/logger"

export function startMonthlySnapshot() {
  cron.schedule("0 0 1 * *", async () => {
    logger.info("Running monthly commission snapshot")
  })
}
