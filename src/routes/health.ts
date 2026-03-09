import { Router } from "express"
import { Pool } from "pg"

export function healthRouter(pool: Pool) {
  const router = Router()

  router.get("/", (_req, res) => {
    res.json({ success: true, data: { status: "ok", uptime: process.uptime(), timestamp: Date.now() } })
  })

  router.get("/db", async (_req, res, next) => {
    try {
      await pool.query("SELECT 1")
      res.json({ success: true, data: { status: "db-ok" } })
    } catch (error) {
      next(error)
    }
  })

  router.get("/queue", (_req, res) => {
    res.json({ success: true, data: { status: "queue-ok" } })
  })

  return router
}
