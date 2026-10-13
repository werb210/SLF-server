import { NextFunction, Request, Response } from "express"
import jwt from "jsonwebtoken"
import { env } from "./env"

// SLF_AUTH_STAFF_ONLY_v784 - this API is for staff and services only. Any valid
// signature used to pass, so client, applicant and tracked-link tokens signed
// with the shared secret could read the SLF mirror.
// SLF_AUTH_NARROW_v789 - narrowed further: only Admin and Staff humans, and only
// bf-server among services. Ops and Marketing tokens are signed with the same
// secret but have no business reading lender and applicant data, and a service
// token used to pass on kind alone, whichever service minted it.
const STAFF_ROLES = new Set(["Admin", "Staff"])
const ALLOWED_SERVICES = new Set(["bf-server"])
export const EXPECTED_AUDIENCE = "slf-server"

// SLF_v792_STAFF_AUDIENCE - BF-Server staff access tokens carry aud
// "boreal-staff-portal"; the portal sends them here for the SLF screens.
export const STAFF_PORTAL_AUDIENCE = "boreal-staff-portal"
const ACCEPTED_AUDIENCES = [EXPECTED_AUDIENCE, STAFF_PORTAL_AUDIENCE]

function audienceAllowed(aud: unknown): boolean {
  if (aud === undefined || aud === null) return true
  if (typeof aud === "string") return ACCEPTED_AUDIENCES.includes(aud)
  if (Array.isArray(aud)) return aud.some((a) => ACCEPTED_AUDIENCES.includes(a))
  return false
}

export function isAllowedPrincipal(decoded: unknown): boolean {
  if (typeof decoded !== "object" || decoded === null) return false
  const claims = decoded as Record<string, unknown>
  if (!audienceAllowed(claims.aud)) return false
  if (claims.kind === "service") {
    const service = typeof claims.service === "string" ? claims.service : claims.source
    return typeof service === "string" && ALLOWED_SERVICES.has(service)
  }
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
