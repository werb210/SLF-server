import express from "express"
import { Request, Response } from "express"

interface RawBodyRequest extends Request {
  rawBody?: string
}

export const rawBodyMiddleware = express.json({
  verify: (req: Request, _res: Response, buf: Buffer) => {
    ;(req as RawBodyRequest).rawBody = buf.toString()
  }
})
