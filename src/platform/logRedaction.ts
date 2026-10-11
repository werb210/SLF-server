export const LOG_CENSOR = "[REDACTED]" as const

const CREDENTIAL_HEADERS = [
  "authorization",
  "Authorization",
  "proxy-authorization",
  "Proxy-Authorization",
  "cookie",
  "Cookie",
  "set-cookie",
  "Set-Cookie"
]

const headerPaths = (prefix: string) => CREDENTIAL_HEADERS.map((name) => `${prefix}.${name}`)

export const REDACTED_LOG_PATHS = [
  ...headerPaths("req.headers"),
  ...headerPaths("res.headers"),
  ...headerPaths("headers"),
  // SLF_REDACT_AXIOS_v789 - second line of defence behind redactAxiosError: an
  // axios error logged as { err } carries the SLF token in its request config,
  // its raw ClientRequest and its response. err.request is named key by key, not
  // as "err.request.*": redaction assigns to every key a wildcard matches, and a
  // ClientRequest has getter-only keys (headersSent), so the wildcard made
  // logger.error itself throw on a raw axios error.
  "err.config.headers.*",
  "err.config.auth",
  "err.request._header",
  "err.request.headers.*",
  "err.response.headers.*",
  "err.response.config.headers.*",
  "err.response.config.auth",
  "err.response.request._header",
  "err.response.request.headers.*"
]
