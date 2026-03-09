import { NextFunction, Request, Response } from "express"

const store = new Map<string, boolean>()

export function idempotency(req: Request, res: Response, next: NextFunction) {
  if (!["POST", "PATCH", "DELETE"].includes(req.method)) {
    return next()
  }

  const headerKey = req.headers["idempotency-key"]
  const key = typeof headerKey === "string" ? headerKey : undefined

  if (!key) {
    return next()
  }

  if (store.has(key)) {
    return res.status(409).json({ success: false, error: "Duplicate request" })
  }

  store.set(key, true)
  return next()
}
