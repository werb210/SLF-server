import { Request, Response } from "express"
import { pool } from "../db"
import { allowedFamilies } from "../config/env"

export async function createDeal(req: Request, res: Response) {
  const { external_id, product_family, raw_payload } = req.body as {
    external_id?: string
    product_family?: string
    raw_payload?: Record<string, unknown>
  }

  if (!external_id || !product_family || !raw_payload) {
    return res.status(400).json({ success: false, error: "Missing required fields" })
  }

  if (!allowedFamilies.includes(product_family)) {
    return res.status(400).json({ success: false, error: "Invalid product family" })
  }

  try {
    const result = await pool.query(
      `INSERT INTO slf_deals (external_id, product_family, raw_payload)
       VALUES ($1,$2,$3)
       RETURNING *`,
      [external_id, product_family, raw_payload]
    )

    return res.json({ success: true, data: result.rows[0] })
  } catch {
    return res.status(400).json({ success: false, error: "Insert failed" })
  }
}

export async function getDeals(req: Request, res: Response) {
  const page = Number(req.query.page || 1)
  const limit = Number(req.query.limit || 25)
  const offset = (page - 1) * limit

  const result = await pool.query(
    "SELECT * FROM slf_deals ORDER BY created_at DESC LIMIT $1 OFFSET $2",
    [limit, offset]
  )

  return res.json({ success: true, data: result.rows })
}
