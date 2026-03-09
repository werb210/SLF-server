import express from "express"
import { Pool } from "pg"

import { requestLogger } from "./middleware/requestLogger"
import { errorHandler } from "./middleware/errorHandler"
import { rawBodyMiddleware } from "./middleware/rawBody"
import { verifyHmac } from "./middleware/hmacAuth"
import { idempotency } from "./middleware/idempotency"

import { dealsRouter } from "./routes/deals"
import { docsRouter } from "./routes/docs"

import { runMigrations } from "./db/init"
import { startSyncWorker } from "./slf/sync.worker"
import { startMonthlySnapshot } from "./cron/monthlySnapshot"

import { logger } from "./logging/logger"
import { env } from "./config/env"

const PORT = Number(env.PORT || 4001)

const pool = new Pool({
  connectionString: env.DATABASE_URL
})

async function start() {
  await runMigrations(pool)

  const app = express()

  app.use(requestLogger)

  app.use(rawBodyMiddleware)

  app.get("/health", async (_, res) => {
    await pool.query("SELECT 1")
    res.json({ status: "ok" })
  })

  app.use("/deals", verifyHmac(env.HMAC_SECRET), idempotency(pool), dealsRouter(pool))

  docsRouter(app)

  app.use(errorHandler)

  app.listen(PORT, () => {
    logger.info(`SLF server running on port ${PORT}`)
  })

  startSyncWorker()
  startMonthlySnapshot()
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server")
  process.exit(1)
})
