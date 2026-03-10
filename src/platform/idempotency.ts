import { NextFunction, Request, Response } from "express"

const requests = new Map<string, boolean>()

export function idempotency(req: Request, res: Response, next: NextFunction) {
  const rawKey = req.headers["idempotency-key"]
  const key = typeof rawKey === "string" ? rawKey : undefined

  if (!key) return next()

  if (requests.has(key)) {
    return res.status(409).json({
      success: false,
      error: "Duplicate request"
    })
  }

  requests.set(key, true)

  setTimeout(() => {
    requests.delete(key)
  }, 3600000)

  return next()
}
