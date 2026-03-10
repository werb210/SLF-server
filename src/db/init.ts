import { Pool } from "pg"
import fs from "fs"
import path from "path"

export async function runMigrations(pool: Pool) {
  const migrationsDir = path.join(process.cwd(), "migrations")
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b))

  for (const migrationFile of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, migrationFile), "utf8")
    await pool.query(sql)
  }
}
