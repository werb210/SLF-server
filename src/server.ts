import express from "express"
import cors from "cors"
import helmet from "helmet"
import { Pool } from "pg"
import { requestLogger } from "./middleware/requestLogger"
import { buildCorsOrigin } from "./platform/corsOrigin" // SLF_CORS_NATIVE_APP_v1
import { slfRouter } from "./routes/slf"
import { docsRouter } from "./routes/docs"
import { startSyncWorker } from "./slf/sync.worker"
import { startMonthlySnapshot } from "./cron/monthlySnapshot"
import { runMigrations } from "./db/init"
import { logger } from "./platform/logger"
import { env } from "./platform/env"
import { errorHandler } from "./platform/errorHandler"
import { requestId } from "./platform/requestId"
import { requireAuth } from "./platform/auth"
import { withExplicitSslMode } from "./db/sslMode"
import healthRoutes from "./platform/healthRoutes"
import metricsRoutes from "./platform/metricsRoutes"
const PORT = Number(env.PORT)
// SLF_DB_SSL_EXPLICIT_v1 - this file opened a SECOND pool straight from
// env.DATABASE_URL, bypassing the normalisation in db/pool.ts. It only runs
// migrations, but that is the connection carrying the schema.
const pool = new Pool({ connectionString: withExplicitSslMode(env.DATABASE_URL) })
async function start() { await runMigrations(pool); logger.info("[MIGRATIONS] All migrations applied."); const app = express(); const origins = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean); app.use(helmet()); /* SLF_CORS_NATIVE_APP_v1 */ app.use(cors({ origin: buildCorsOrigin(origins), credentials: true })); app.use(requestId); app.use(express.json({ limit: "2mb" })); app.use(requestLogger); // SLF_ROOT_ROUTE_v1 - AlwaysOn and the platform warm-up both hit "/", which
    // had no handler, so every ping logged a 404.
    app.get("/", (_req, res) => { res.json({ service: env.SERVICE_NAME, status: "ok" }); });
    app.use("/health", healthRoutes); app.use(metricsRoutes); app.use("/api/slf", requireAuth, slfRouter()); docsRouter(app); app.use(errorHandler); app.listen(PORT, () => logger.info({ port: PORT }, "SLF server running")); startSyncWorker(); startMonthlySnapshot() }
start().catch((err) => { logger.error({ err }, "Failed to start server"); process.exit(1) })
