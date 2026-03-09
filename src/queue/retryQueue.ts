import { Pool } from "pg"
import { logger } from "../logging/logger"

interface RetryItem {
  job: string
  payload: any
}

const queue: RetryItem[] = []

export function enqueueRetry(job: string, payload: any) {
  queue.push({ job, payload })
}

export async function processRetryQueue(pool: Pool) {
  while (queue.length > 0) {
    const item = queue.shift()

    try {
      logger.info({ job: item?.job, payload: item?.payload }, "Retrying job")
      await pool.query("SELECT 1")
    } catch (err) {
      logger.error({ err, job: item?.job }, "Retry failed")
    }
  }
}
