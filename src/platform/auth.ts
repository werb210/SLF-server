import { NextFunction, Request, Response } from "express"
import jwt from "jsonwebtoken"
import { env } from "./env"

// SLF_AUTH_STAFF_ONLY_v784 - this API is for staff and services only. Any valid
// signature used to pass, so client, applicant and tracked-link tokens signed
// with the shared secret could read the SLF mirror.
const STAFF_ROLES = new Set(["Admin", "Staff", "Ops", "Marketing"])

export function isAllowedPrincipal(decoded: unknown): boolean {
  if (typeof decoded !== "object" || decoded === null) return false
  const claims = decoded as Record<string, unknown>
  if (claims.kind === "service") return true
  const role = claims.role
  if (typeof role !== "string" || !STAFF_ROLES.has(role)) return false
  const subject = typeof claims.sub === "string" && claims.sub ? claims.sub : claims.id
  if (typeof subject !== "string" || !subject) return false
  return !subject.startsWith("client:")
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization

  if (!auth) {
    return res.status(401).json({ success: false, error: "Unauthorized" })
  }

  const token = auth.replace("Bearer ", "")

  let decoded: unknown
  try {
    decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] })
  } catch {
    return res.status(401).json({
      success: false,
      error: "Invalid token"
    })
  }

  if (!isAllowedPrincipal(decoded)) {
    return res.status(403).json({ success: false, error: "Forbidden" })
  }

  req.user = decoded
  return next()
}
