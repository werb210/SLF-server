import express from "express"
import { Pool } from "pg"

import { requestLogger } from "./middleware/requestLogger"
import { rawBodyMiddleware } from "./middleware/rawBody"
import { verifyHmac } from "./middleware/hmacAuth"

import { dealsRouter } from "./routes/deals"
import { docsRouter } from "./routes/docs"

import { startSyncWorker } from "./slf/sync.worker"
import { startMonthlySnapshot } from "./cron/monthlySnapshot"

import { logger } from "./platform/logger"
import { env } from "./platform/env"
import { errorHandler } from "./platform/errorHandler"
import { idempotency } from "./platform/idempotency"
import { requestId } from "./platform/requestId"
import { requireAuth } from "./platform/auth"
import healthRoutes from "./platform/healthRoutes"
import metricsRoutes from "./platform/metricsRoutes"

const PORT = Number(env.PORT)

const pool = new Pool({
  connectionString: env.DATABASE_URL
})

async function start() {

  const app = express()

  app.use(requestId)
  app.use(idempotency)
  app.use(express.json())

  app.use(requestLogger)
  app.use(rawBodyMiddleware)

  app.use("/health", healthRoutes)
  app.use(metricsRoutes)

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
