// SLF_REQUIRE_UPSTREAM_CONFIG_v230
import { describe, expect, it, vi } from "vitest"

// env.ts validates process.env when it is imported. Seed the four required
// values before Vitest evaluates that import so this suite can exercise the
// exported schema without weakening the application's fail-fast startup.
vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/boreal"
  process.env.JWT_SECRET = "test-secret-min-10"
  process.env.SLF_TOKEN = "abc123"
  process.env.SLF_BASE_URL = "https://fintech.example.com"
})

import { envSchema } from "../src/platform/env"

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/boreal",
  JWT_SECRET: "test-secret-min-10",
  SLF_TOKEN: "abc123",
  SLF_BASE_URL: "https://fintech.example.com",
}

describe("the config that decided whether the sync did anything", () => {
  it("accepts a complete environment", () => {
    expect(envSchema.safeParse(base).success).toBe(true)
  })

  it("refuses a missing base url instead of fetching from nowhere", () => {
    const { SLF_BASE_URL, ...without } = base
    expect(envSchema.safeParse(without).success).toBe(false)
  })

  it("refuses an empty base url, which z.string() alone would allow", () => {
    // This is the exact value that produced six months of synced: 0.
    expect(envSchema.safeParse({ ...base, SLF_BASE_URL: "" }).success).toBe(false)
  })

  it("refuses a missing token instead of sending 'Authorization: Token '", () => {
    const { SLF_TOKEN, ...without } = base
    expect(envSchema.safeParse(without).success).toBe(false)
  })

  it("refuses an empty token", () => {
    expect(envSchema.safeParse({ ...base, SLF_TOKEN: "" }).success).toBe(false)
  })

  it("refuses a base url that is not a url", () => {
    expect(envSchema.safeParse({ ...base, SLF_BASE_URL: "fintech.example.com" }).success).toBe(false)
  })

  it("names the offending variable in the error", () => {
    const result = envSchema.safeParse({ ...base, SLF_BASE_URL: "" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("SLF_BASE_URL"))).toBe(true)
      expect(result.error.issues.some((i) => /nowhere to fetch/.test(i.message))).toBe(true)
    }
  })

  it("leaves the genuinely optional settings alone", () => {
    // Widening this block must not accidentally make these mandatory.
    const parsed = envSchema.parse(base)
    expect(parsed.SLF_AUTH_SCHEME).toBe("Token")
    expect(parsed.SYNC_INTERVAL_MINUTES).toBe("5")
    expect(parsed.SLF_PRODUCT_FAMILIES).toContain("credit")
  })
})

describe("the committed token", () => {
  it("is no longer in .env.example", async () => {
    const fs = await import("node:fs")
    const example = fs.readFileSync(".env.example", "utf-8")
    expect(example).not.toContain("c6b32011b346f3cf2df798ceb20757aec835d74b")
    expect(example).toContain("replace-me")
  })
})
