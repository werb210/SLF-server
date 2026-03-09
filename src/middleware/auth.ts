import { NextFunction, Request, Response } from "express"
import jwt from "jsonwebtoken"
import { env } from "../config/env"

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization

  if (!header) {
    return res.status(401).json({ success: false, error: "Unauthorized" })
  }

  const token = header.replace("Bearer ", "")

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET)
    req.user = typeof decoded === "string" ? decoded : (decoded as Record<string, unknown>)
    return next()
  } catch {
    return res.status(401).json({ success: false, error: "Invalid token" })
  }
}
