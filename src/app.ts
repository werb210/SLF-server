import express from "express"
import cors from "cors"
import helmet from "helmet"
import syncStatusRoutes from "./routes/syncStatusRoutes"
import { requestLogger } from "./middleware/requestLogger"
import { buildCorsOrigin } from "./platform/corsOrigin" // SLF_CORS_NATIVE_APP_v1
import { slfRouter } from "./routes/slf"
import { docsRouter } from "./routes/docs"
import { env } from "./platform/env"
import { errorHandler } from "./platform/errorHandler"
import { requestId } from "./platform/requestId"
import { requireAuth } from "./platform/auth"
import healthRoutes from "./platform/healthRoutes"
import metricsRoutes from "./platform/metricsRoutes"

// SLF_APP_FACTORY_v789 - the app is built here, with no migrations, listener or
// cron, so tests can drive the real middleware stack over HTTP instead of
// grepping server.ts for the order of app.use calls.
export function createApp(opts: { nodeEnv?: string } = {}) {
  const app = express()
  const origins = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  app.use(helmet())
  /* SLF_CORS_NATIVE_APP_v1 */
  app.use(cors({ origin: buildCorsOrigin(origins), credentials: true }))
  app.use(requestId)
  app.use(express.json({ limit: "2mb" }))
  app.use(requestLogger)
  // SLF_ROOT_ROUTE_v1 - AlwaysOn and the platform warm-up both hit "/", which
  // had no handler, so every ping logged a 404.
  app.get("/", (_req, res) => {
    res.json({ service: env.SERVICE_NAME, status: "ok" })
  })
  app.use("/health", healthRoutes)
  /* SLF_METRICS_AUTH_v784 */
  app.use("/metrics", requireAuth)
  app.use(metricsRoutes)
  app.use("/api/slf", requireAuth, slfRouter(), syncStatusRoutes)
  docsRouter(app, opts.nodeEnv ?? env.NODE_ENV)
  app.use(errorHandler)
  return app
}
