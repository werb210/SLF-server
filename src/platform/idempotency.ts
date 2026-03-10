import { NextFunction, Request, Response } from "express"
import { pool } from "../db/index"

export async function idempotency(req: Request, res: Response, next: NextFunction) {
  if (!["POST", "PATCH", "DELETE"].includes(req.method)) {
    return next()
  }

  const rawKey = req.headers["idempotency-key"] ?? req.headers["x-idempotency-key"]
  const key = typeof rawKey === "string" ? rawKey : undefined

  if (!key) return next()

  try {
    await pool.query("INSERT INTO slf_idempotency (idempotency_key) VALUES ($1)", [key])
    return next()
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      return res.status(409).json({
        success: false,
        error: "Duplicate request"
      })
    }

    return next(error)
  }
}
