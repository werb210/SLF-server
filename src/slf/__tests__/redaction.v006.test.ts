// SLF_REDACT_v1
import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"

const worker = fs.readFileSync(path.resolve(__dirname, "../sync.worker.ts"), "utf8")

describe("SLF credentials never reach the logs", () => {
  it("does not log the raw axios error object", () => {
    // { family, error } serialises config.headers.Authorization in full.
    expect(worker).not.toMatch(/logger\.error\(\{\s*family,\s*error\s*\}/)
  })

  it("logs status and detail instead", () => {
    expect(worker).toContain("detail: message")
  })
})
