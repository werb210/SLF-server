import { Request, Response } from "express"
import { syncAllFamilies } from "./sync.worker"
import { slfState } from "./slf.state"

export async function manualSync(_req: Request, res: Response) {
  try {
    await syncAllFamilies(true)
    return res.json({
      success: true,
      data: {
        status: "triggered",
        lastSuccessfulSync: slfState.lastSuccessfulSync,
        lastError: slfState.lastError
      }
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return res.status(500).json({ success: false, error: message })
  }
}
