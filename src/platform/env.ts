import dotenv from "dotenv"
import { z } from "zod"

dotenv.config()

export const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.string().default("3000"),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string(),
  SERVICE_NAME: z.string().default("slf-server"),
  OPENAI_API_KEY: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  HMAC_SECRET: z.string().default(""),
  // SLF_REQUIRE_UPSTREAM_CONFIG_v230
  // Required, non-empty. A blank token produces the header "Token " and a blank
  // base URL produces a request to nowhere - neither throws, so the sync reports
  // success with zero records and nothing ever surfaces the misconfiguration.
  SLF_TOKEN: z
    .string()
    .min(1, "SLF_TOKEN is required - the sync cannot authenticate without it"),
  SLF_BASE_URL: z
    .string()
    .min(1, "SLF_BASE_URL is required - the sync has nowhere to fetch from")
    .url("SLF_BASE_URL must be a full URL, e.g. https://fintech.example.com")
    .refine(
      (value) => !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(value) || process.env.NODE_ENV !== "production",
      "SLF_BASE_URL points at localhost in production",
    ),
  SLF_AUTH_SCHEME: z.string().default("Token"),
  ALLOWED_ORIGINS: z.string().default("https://staff.boreal.financial"),
  LOG_LEVEL: z.string().default("info"),
  SLF_PRODUCT_FAMILIES: z.string().default("credit,equipment-financing,factoring-bid,invoice"),
  SYNC_INTERVAL_MINUTES: z.string().default("5"),
  API_KEY: z.string().default("")
})

// SLF_REQUIRE_UPSTREAM_CONFIG_v230
// parse() throws a ZodError whose default rendering buries which variable is at
// fault. On a container start that message is all anyone gets, so name them.
function parseEnv() {
  const result = envSchema.safeParse(process.env)
  if (result.success) return result.data
  const problems = result.error.issues
    .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n")
  throw new Error(
    `slf-server cannot start - invalid environment:\n${problems}\n\n` +
      "Set these in Azure Portal -> slf-server -> Environment variables.",
  )
}

export const env = parseEnv()

// SLF_REQUIRE_UPSTREAM_CONFIG_v230
// A QA host in production is not a crash, but it is almost certainly a mistake -
// migrations/005_slf_retire_stale.sql records that this exact thing has happened
// before. Warn rather than refuse: someone may be running QA deliberately.
if (env.NODE_ENV === "production" && /\b(qa|staging|test|dev)[-.]/i.test(env.SLF_BASE_URL)) {
  console.warn(
    `[slf-server] SLF_BASE_URL looks like a non-production host in production: ${env.SLF_BASE_URL}`,
  )
}

export const allowedFamilies = env.SLF_PRODUCT_FAMILIES.split(",")
  .map((family) => family.trim())
  .filter(Boolean)
