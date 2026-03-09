import dotenv from "dotenv"
import { z } from "zod"

dotenv.config()

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().default(""),
  API_KEY: z.string().default(""),
  HMAC_SECRET: z.string().min(1, "HMAC_SECRET is required"),
  SLF_TOKEN: z.string().default(""),
  SLF_BASE_URL: z.string().default(""),
  LOG_LEVEL: z.string().optional(),
  SLF_PRODUCT_FAMILIES: z
    .string()
    .default("credit,equipment-financing,factoring-bid,invoice"),
  SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().default(5)
})

const parsed = schema.parse(process.env)

export const env = parsed

export const ENV = {
  ...parsed,
  SLF_PRODUCT_FAMILIES: parsed.SLF_PRODUCT_FAMILIES.split(",")
    .map((family) => family.trim())
    .filter(Boolean)
}

if (ENV.NODE_ENV === "production" && !ENV.JWT_SECRET) {
  throw new Error("Missing JWT_SECRET")
}

export const config = {
  port: ENV.PORT,
  databaseUrl: ENV.DATABASE_URL,
  slfToken: ENV.SLF_TOKEN,
  allowedFamilies: ENV.SLF_PRODUCT_FAMILIES
}
