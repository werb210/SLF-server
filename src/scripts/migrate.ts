import { Pool } from "pg"
import { env } from "../platform/env"
import { runMigrations } from "../db/init"

async function migrate() {
  const pool = new Pool({ connectionString: env.DATABASE_URL })

  try {
    await runMigrations(pool)
    console.log("Migrations completed")
  } finally {
    await pool.end()
  }
}

migrate().catch((error) => {
  console.error("Migration failed", error)
  process.exit(1)
})
