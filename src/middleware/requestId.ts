import { randomUUID } from "crypto"
import { NextFunction, Request, Response } from "express"

declare global {
  namespace Express {
    interface Request {
      id?: string
      rawBody?: string
      user?: unknown
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction) {
  const incomingId = req.headers["x-request-id"]
  const id = typeof incomingId === "string" ? incomingId : randomUUID()

  req.id = id
  res.setHeader("X-Request-Id", id)

  next()
}
