import { describe, expect, it, vi } from "vitest"
import { buildCorsOrigin } from "../src/platform/corsOrigin"

function evaluateOrigin(origin: string | undefined, configuredOrigins = ["https://staff.boreal.financial"]) {
  const callback = vi.fn()
  const matcher = buildCorsOrigin(configuredOrigins)

  if (typeof matcher !== "function") throw new Error("Expected a CORS origin callback")
  matcher(origin, callback)

  return callback
}

describe("buildCorsOrigin", () => {
  it.each(["capacitor://localhost", "ionic://localhost"])("allows the native app origin %s", (origin) => {
    expect(evaluateOrigin(origin)).toHaveBeenCalledWith(null, true)
  })

  it("allows a configured web origin", () => {
    expect(evaluateOrigin("https://staff.boreal.financial")).toHaveBeenCalledWith(null, true)
  })

  it("allows requests without an Origin header", () => {
    expect(evaluateOrigin(undefined)).toHaveBeenCalledWith(null, true)
  })

  it("rejects an unconfigured public origin", () => {
    const callback = evaluateOrigin("https://attacker.example")
    expect(callback).toHaveBeenCalledOnce()
    expect(callback.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(callback.mock.calls[0][1]).toBeUndefined()
  })
})
