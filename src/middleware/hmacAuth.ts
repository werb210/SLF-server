import crypto from "crypto"
import { NextFunction, Request, Response } from "express"

export function verifyHmac(secret: string) {
  return (req: Request & { rawBody?: string }, res: Response, next: NextFunction) => {
    const signatureHeader = req.headers["x-signature"]
    const signature = typeof signatureHeader === "string" ? signatureHeader : ""

    if (!signature) {
      return res.status(401).json({ success: false, error: "Missing signature header" })
    }

    const computed = crypto.createHmac("sha256", secret).update(req.rawBody || "").digest("hex")

    const sigBuffer = Buffer.from(signature)
    const computedBuffer = Buffer.from(computed)
    if (sigBuffer.length !== computedBuffer.length || !crypto.timingSafeEqual(sigBuffer, computedBuffer)) {
      return res.status(401).json({ success: false, error: "Invalid signature" })
    }

    return next()
  }
}
