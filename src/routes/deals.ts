import { Router } from "express"
import { Pool } from "pg"
import { z } from "zod"

const dealPayloadSchema = z.object({
  external_id: z.string().min(1),
  borrower_name: z.string().min(1).optional(),
  amount: z.number().finite().optional(),
  product_family: z.string().min(1).optional()
})

export function dealsRouter(pool: Pool) {
  const router = Router()

  router.post("/", async (req, res, next) => {
    try {
      const parsedPayload = dealPayloadSchema.safeParse(req.body)

      if (!parsedPayload.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request body",
          issues: parsedPayload.error.issues
        })
      }

      const payload = parsedPayload.data

      const result = await pool.query(
        `INSERT INTO slf_deals
        (external_id, borrower_name, amount, product_family, raw_payload)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING *`,
        [
          payload.external_id,
          payload.borrower_name ?? null,
          payload.amount ?? null,
          payload.product_family ?? null,
          payload
        ]
      )

      res.json({ success: true, data: result.rows[0] })
    } catch (error) {
      next(error)
    }
  })

  router.get("/", async (_req, res, next) => {
    try {
      const deals = await pool.query("SELECT * FROM slf_deals ORDER BY created_at DESC")
      res.json({ success: true, data: deals.rows })
    } catch (error) {
      next(error)
    }
  })

  return router
}
