import { NextFunction, Request, Response } from "express"
import { logger } from "./logger"

// SLF_ERROR_REDACTION_v784 - raw error messages (SQL, upstream URLs, stack
// details) used to reach the client. Log everything, return a generic body.
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  logger.error(
    {
      requestId: req.id,
      err
    },
    "Unhandled error"
  )

  if (res.headersSent) {
    return next(err)
  }

  const e = (typeof err === "object" && err !== null ? err : {}) as {
    status?: unknown
    statusCode?: unknown
    expose?: unknown
    message?: unknown
  }
  const rawStatus = typeof e.status === "number" ? e.status : typeof e.statusCode === "number" ? e.statusCode : 500
  const status = rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500
  const exposable = status < 500 && e.expose === true && typeof e.message === "string"

  return res.status(status).json({
    success: false,
    error: exposable ? (e.message as string) : "Internal Server Error",
    requestId: req.id
  })
}
