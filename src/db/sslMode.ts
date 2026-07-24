// SLF_DB_SSL_EXPLICIT_v1
// Its own module, free of any env import, so it can be unit tested. db/pool.ts
// imports ../config/env, which validates DATABASE_URL at import time and throws
// under vitest.
//
// pg warns on every boot that sslmode 'prefer' | 'require' | 'verify-ca' are
// currently ALIASED to verify-full, and that pg v9 / pg-connection-string v3
// will move them to libpq semantics - which are weaker. On that upgrade a
// connection string saying sslmode=require would quietly stop verifying the
// server certificate: no error, no log line, just a downgraded connection.
//
// Naming verify-full explicitly pins today's real behaviour so the upgrade
// changes nothing. Only the weaker modes are rewritten; an existing verify-full,
// or a disable set deliberately for local work, is left alone.
export function withExplicitSslMode(connectionString: string): string {
  if (!connectionString) return connectionString;
  const weaker = /([?&])sslmode=(prefer|require|verify-ca)(&|$)/i;
  if (!weaker.test(connectionString)) return connectionString;
  return connectionString.replace(weaker, "$1sslmode=verify-full$3");
}
