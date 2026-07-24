import { Pool } from "pg"
import { env } from "../config/env"
// SLF_DB_SSL_EXPLICIT_v1
import { withExplicitSslMode } from "./sslMode"

export const pool = new Pool({
  connectionString: withExplicitSslMode(env.DATABASE_URL)
})
