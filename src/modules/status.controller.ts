import { Request, Response } from "express"
import { pool } from "../db"

export async function updateDealStatus(req: Request, res: Response) {
  const { id: dealId } = req.params
  const { status } = req.body as { status?: string }

  const allowed = ["received", "processing", "completed", "rejected"]

  if (!status || !allowed.includes(status)) {
    return res.status(400).json({ success: false, error: "Invalid status" })
  }

  await pool.query("UPDATE slf_deals SET status=$1 WHERE id=$2", [status, dealId])

  await pool.query(
    "INSERT INTO slf_logs(entity_type, entity_id, event_type, metadata) VALUES($1,$2,$3,$4)",
    ["deal", dealId, "status_update", { status }]
  )

  return res.json({ success: true, data: { updated: true } })
}
