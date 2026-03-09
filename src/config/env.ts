import dotenv from "dotenv"
import { z } from "zod"

dotenv.config()

export const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.string().default("3000"),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string(),
  OPENAI_API_KEY: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  HMAC_SECRET: z.string().default(""),
  SLF_TOKEN: z.string().default(""),
  SLF_BASE_URL: z.string().default(""),
  LOG_LEVEL: z.string().default("info"),
  SLF_PRODUCT_FAMILIES: z.string().default("credit,equipment-financing,factoring-bid,invoice"),
  SYNC_INTERVAL_MINUTES: z.string().default("5"),
  API_KEY: z.string().default("")
})

export const env = envSchema.parse(process.env)

export const allowedFamilies = env.SLF_PRODUCT_FAMILIES.split(",")
  .map((family) => family.trim())
  .filter(Boolean)
