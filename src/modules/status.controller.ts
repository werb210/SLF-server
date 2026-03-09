import { Request, Response } from "express"
import { pool } from "../db"

export async function updateDealStatus(req: Request, res: Response) {
  const { id: dealUuid } = req.params
  const { status } = req.body as { status?: string }

  const allowed = ["received", "processing", "completed", "rejected"]

  if (!status || !allowed.includes(status)) {
    return res.status(400).json({ success: false, error: "Invalid status" })
  }

  await pool.query("UPDATE slf_deals SET status=$1 WHERE uuid=$2", [status, dealUuid])

  await pool.query(
    "INSERT INTO slf_logs(entity_type, entity_uuid, event_type, metadata) VALUES($1,$2,$3,$4)",
    ["deal", dealUuid, "status_update", { status }]
  )

  return res.json({ success: true, data: { updated: true } })
}
