import express from "express"
import { Pool } from "pg"

import { requestLogger } from "./middleware/requestLogger"
import { errorHandler } from "./middleware/errorHandler"
import { rawBodyMiddleware } from "./middleware/rawBody"
import { verifyHmac } from "./middleware/hmacAuth"
import { idempotency } from "./middleware/idempotency"
import { requestId } from "./middleware/requestId"
import { requireAuth } from "./middleware/auth"

import { dealsRouter } from "./routes/deals"
import { docsRouter } from "./routes/docs"
import { healthRouter } from "./routes/health"

import { runMigrations } from "./db/init"
import { startSyncWorker } from "./slf/sync.worker"
import { startMonthlySnapshot } from "./cron/monthlySnapshot"

import { logger } from "./lib/logger"
import { env } from "./config/env"

const PORT = Number(env.PORT)

const pool = new Pool({
  connectionString: env.DATABASE_URL
})

async function start() {
  await runMigrations(pool)

  const app = express()

  app.use(requestLogger)
  app.use(requestId)
  app.use(rawBodyMiddleware)
  app.use(idempotency)

  app.use("/health", healthRouter(pool))

  app.use("/deals", requireAuth, verifyHmac(env.HMAC_SECRET), dealsRouter(pool))

  docsRouter(app)

  app.use(errorHandler)

  app.listen(PORT, () => {
    logger.info({ port: PORT }, "SLF server running")
  })

  startSyncWorker()
  startMonthlySnapshot()
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server")
  process.exit(1)
})
