import express from "express"
import cors from "cors"
import helmet from "helmet"
import { Pool } from "pg"
import { requestLogger } from "./middleware/requestLogger"
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
import healthRoutes from "./platform/healthRoutes"
import metricsRoutes from "./platform/metricsRoutes"
const PORT = Number(env.PORT)
const pool = new Pool({ connectionString: env.DATABASE_URL })
async function start() { await runMigrations(pool); logger.info("[MIGRATIONS] All migrations applied."); const app = express(); const origins = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean); app.use(helmet()); app.use(cors({ origin: origins, credentials: true })); app.use(requestId); app.use(express.json({ limit: "2mb" })); app.use(requestLogger); app.use("/health", healthRoutes); app.use(metricsRoutes); app.use("/api/slf", requireAuth, slfRouter()); docsRouter(app); app.use(errorHandler); app.listen(PORT, () => logger.info({ port: PORT }, "SLF server running")); startSyncWorker(); startMonthlySnapshot() }
start().catch((err) => { logger.error({ err }, "Failed to start server"); process.exit(1) })
