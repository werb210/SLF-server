import { NextFunction, Request, Response } from "express"
import { logger } from "./logger"

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  logger.error(
    {
      requestId: req.id,
      error: err
    },
    "Unhandled error"
  )

  if (res.headersSent) {
    return next(err)
  }

  const status =
    typeof err === "object" && err !== null && "status" in err && typeof (err as { status?: number }).status === "number"
      ? (err as { status: number }).status
      : 500
  const message =
    typeof err === "object" && err !== null && "message" in err && typeof (err as { message?: string }).message === "string"
      ? (err as { message: string }).message
      : "Internal Server Error"

  return res.status(status).json({
    success: false,
    error: message,
    requestId: req.id
  })
}
