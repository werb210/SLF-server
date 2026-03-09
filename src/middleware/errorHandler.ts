import { NextFunction, Request, Response } from "express"
import { logger } from "../logging/logger"

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  logger.error({ err, path: req.path, method: req.method }, "Unhandled error")

  if (res.headersSent) {
    return next(err)
  }

  return res.status(err.status || 500).json({
    error: err.message || "Internal Server Error"
  })
}
