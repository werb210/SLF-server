import { NextFunction, Request, Response } from "express"
import { env } from "../config/env"

export interface SLFUser {
  role: "admin" | "staff"
}
export function slfAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Unauthorized" })
  }

  const token = header.replace("Bearer ", "")

  if (token !== env.SLF_TOKEN) {
    return res.status(403).json({ success: false, error: "Invalid token" })
  }

  req.user = { role: "admin" }

  return next()
}
