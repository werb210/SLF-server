export const LOG_CENSOR = "[REDACTED]" as const

export const REDACTED_LOG_PATHS = [
  "req.headers.authorization",
  "req.headers.Authorization",
  "req.headers.proxy-authorization",
  "req.headers.Proxy-Authorization",
  "req.headers.cookie",
  "req.headers.Cookie",
  "req.headers.set-cookie",
  "req.headers.Set-Cookie",
  "res.headers.authorization",
  "res.headers.Authorization",
  "res.headers.proxy-authorization",
  "res.headers.Proxy-Authorization",
  "res.headers.cookie",
  "res.headers.Cookie",
  "res.headers.set-cookie",
  "res.headers.Set-Cookie",
  "headers.authorization",
  "headers.Authorization",
  "headers.proxy-authorization",
  "headers.Proxy-Authorization",
  "headers.cookie",
  "headers.Cookie",
  "headers.set-cookie",
  "headers.Set-Cookie"
]
