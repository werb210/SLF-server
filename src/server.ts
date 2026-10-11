import { Pool } from "pg"
import { createApp } from "./app"
import { startSyncWorker } from "./slf/sync.worker"
import { runMigrations } from "./db/init"
import { logger } from "./platform/logger"
import { env } from "./platform/env"
import { withExplicitSslMode } from "./db/sslMode"

const PORT = Number(env.PORT)
// SLF_DB_SSL_EXPLICIT_v1 - this file opened a SECOND pool straight from
// env.DATABASE_URL, bypassing the normalisation in db/pool.ts. It only runs
// migrations, but that is the connection carrying the schema.
const pool = new Pool({ connectionString: withExplicitSslMode(env.DATABASE_URL) })

async function start() {
  await runMigrations(pool)
  logger.info("[MIGRATIONS] All migrations applied.")
  const app = createApp()
  app.listen(PORT, () => logger.info({ port: PORT }, "SLF server running"))
  startSyncWorker()
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server")
  process.exit(1)
})
