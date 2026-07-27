import type { CorsOptions } from "cors"

/** Origins used by Capacitor's native WebViews rather than the hosted portal. */
export const NATIVE_APP_ORIGINS = new Set([
  "capacitor://localhost",
  "ionic://localhost",
])

/**
 * Build the callback consumed by the cors middleware.
 * Requests without an Origin are non-browser traffic and remain allowed.
 */
export function buildCorsOrigin(allowedOrigins: readonly string[]): CorsOptions["origin"] {
  const allowed = new Set(allowedOrigins)

  return (origin, callback) => {
    if (!origin || allowed.has(origin) || NATIVE_APP_ORIGINS.has(origin)) {
      callback(null, true)
      return
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS`))
  }
}
