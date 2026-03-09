import { NextFunction, Request, Response } from "express"

interface RoleUser {
  role: "admin" | "staff"
}

export function requireRole(role: "admin" | "staff") {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as RoleUser | undefined
    if (!user || user.role !== role) {
      return res.status(403).json({ success: false, error: "Forbidden" })
    }

    return next()
  }
}
