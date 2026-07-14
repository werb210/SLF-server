import { Pool } from "pg"
import fs from "fs"
import path from "path"

// SLF_FULL_MODEL_v1 - filename-keyed ledger.
export async function runMigrations(pool: Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
  const done = new Set((await pool.query<{ filename: string }>(`SELECT filename FROM schema_migrations`)).rows.map((r) => r.filename))
  const dir = path.join(process.cwd(), "migrations")
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort((a, b) => a.localeCompare(b))
  for (const file of files) {
    if (done.has(file)) continue
    const sql = fs.readFileSync(path.join(dir, file), "utf8")
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(sql)
      await client.query(`INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`, [file])
      await client.query("COMMIT")
      console.log(`[MIGRATIONS] applied ${file}`)
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {})
      console.error(`[MIGRATIONS] FATAL on ${file}`, e)
      throw e
    } finally { client.release() }
  }
}
