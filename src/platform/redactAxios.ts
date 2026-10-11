// SLF_REDACT_AXIOS_v789
// An axios error carries the request that failed: err.config.headers holds the
// SLF "Authorization: Token <key>" header, err.request is the raw ClientRequest
// whose _header string repeats it, and err.response repeats both again. pino's
// err serialiser copies every enumerable property, so logging or forwarding the
// error as-is wrote the upstream token into the logs. Strip all of that before
// the error goes anywhere.
import { isAxiosError } from "axios"

export const REDACTED = "[REDACTED]"
const SENSITIVE_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key)$/i

export function redactHeaders(headers: unknown): Record<string, unknown> | undefined {
  if (!headers || typeof headers !== "object") return undefined
  const source =
    typeof (headers as { toJSON?: unknown }).toJSON === "function"
      ? ((headers as { toJSON: () => unknown }).toJSON() as Record<string, unknown>)
      : (headers as Record<string, unknown>)
  const out: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(source ?? {})) {
    out[name] = SENSITIVE_HEADER.test(name) ? REDACTED : value
  }
  return out
}

/**
 * Strip credentials from an axios error in place and return it. Anything that
 * is not an axios error is returned untouched.
 */
export function redactAxiosError<T>(err: T): T {
  if (!isAxiosError(err)) return err
  const e = err as unknown as Record<string, unknown>
  const config = e.config as Record<string, unknown> | undefined
  if (config) {
    // Keep what helps debugging; drop headers values, auth and agents.
    e.config = {
      method: config.method,
      baseURL: config.baseURL,
      url: config.url,
      timeout: config.timeout,
      headers: redactHeaders(config.headers),
    }
  }
  if (e.request) {
    const req = e.request as { method?: unknown; path?: unknown }
    e.request = { method: req.method, path: req.path }
  }
  const response = e.response as Record<string, unknown> | undefined
  if (response) {
    e.response = {
      status: response.status,
      statusText: response.statusText,
      headers: redactHeaders(response.headers),
      data: response.data,
    }
  }
  return err
}

/**
 * A failure talking to SLF is a bad gateway from the caller's point of view.
 * Without this the errorHandler would echo SLF's own status (axios copies it to
 * err.status), so an expired SLF token reached the portal as a 401 and looked
 * like the staff member's session had expired.
 */
export function toUpstreamError<T>(err: T): T {
  const redacted = redactAxiosError(err)
  if (isAxiosError(redacted)) {
    const e = redacted as unknown as { status?: number; expose?: boolean }
    e.status = 502
    e.expose = false
  }
  return redacted
}
