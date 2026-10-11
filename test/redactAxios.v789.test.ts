// SLF_REDACT_AXIOS_v789
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/boreal"
  process.env.JWT_SECRET = "test-secret-min-10"
  process.env.SLF_TOKEN = "unused-in-this-suite"
  process.env.SLF_BASE_URL = "https://fintech.example.com"
  process.env.NODE_ENV = "test"
})

import http from "node:http"
import type { AddressInfo } from "node:net"
import axios, { AxiosError } from "axios"
import { createLogger } from "../src/platform/logger"
import { REDACTED, redactAxiosError, toUpstreamError } from "../src/platform/redactAxios"

const TOKEN = "Token upstream-secret-for-redaction-tests"

let upstream: http.Server
let url = ""
beforeAll(async () => {
  upstream = http.createServer((_req, res) => {
    res.statusCode = 401
    res.setHeader("content-type", "application/json")
    res.setHeader("set-cookie", "sessionid=upstream-session-cookie")
    res.end(JSON.stringify({ detail: "Invalid token." }))
  })
  await new Promise<void>((resolve) => upstream.listen(0, resolve))
  url = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/api/broker/`
})
afterAll(() => new Promise((resolve) => upstream.close(resolve)))

async function realUpstreamError(): Promise<AxiosError> {
  try {
    await axios.get(url, { headers: { Authorization: TOKEN, Cookie: "csrftoken=abc" } })
  } catch (err) {
    return err as AxiosError
  }
  throw new Error("expected the upstream call to fail")
}

function capture() {
  const lines: string[] = []
  const logger = createLogger({ write: (line: string) => void lines.push(line) })
  return { logger, output: () => lines.join("") }
}

describe("redactAxiosError", () => {
  it("strips the token from config, request and response but keeps what helps debugging", async () => {
    const err = await realUpstreamError()
    expect(JSON.stringify(err.config?.headers)).toContain(TOKEN) // precondition
    redactAxiosError(err)
    expect(err.config?.headers).toMatchObject({ Authorization: REDACTED, Cookie: REDACTED })
    expect(err.config?.url).toBe(url)
    expect(err.response?.status).toBe(401)
    expect(err.response?.data).toEqual({ detail: "Invalid token." })
    expect((err.response?.headers as Record<string, unknown>)["set-cookie"]).toBe(REDACTED)
    expect(err.request).toEqual({ method: "GET", path: "/api/broker/" })
    expect(err.message).toBe("Request failed with status code 401")
  })

  it("leaves anything that is not an axios error alone", () => {
    const plain = Object.assign(new Error("db down"), { config: { headers: { Authorization: TOKEN } } })
    expect(redactAxiosError(plain)).toBe(plain)
    expect(plain.config.headers.Authorization).toBe(TOKEN)
    expect(redactAxiosError(null)).toBeNull()
  })

  it("toUpstreamError makes an SLF failure a non-exposed 502", async () => {
    const err = toUpstreamError(await realUpstreamError()) as AxiosError & { expose?: boolean }
    expect(err.status).toBe(502)
    expect(err.expose).toBe(false)
  })
})

describe("the application logger", () => {
  it("never writes the token when a raw axios error is logged as { err }", async () => {
    const { logger, output } = capture()
    const err = await realUpstreamError()
    expect(() => logger.error({ err }, "upstream failed")).not.toThrow()
    expect(output()).toContain("Request failed with status code 401")
    expect(output()).not.toContain("upstream-secret-for-redaction-tests")
    expect(output()).not.toContain("upstream-session-cookie")
    expect(output()).not.toContain("csrftoken=abc")
  })

  it("redacts err.config.headers when an already-plain error object is logged", () => {
    const { logger, output } = capture()
    logger.error(
      { err: { message: "x", config: { headers: { Authorization: TOKEN } }, request: { _header: `Authorization: ${TOKEN}` } } },
      "plain",
    )
    expect(output()).not.toContain("upstream-secret-for-redaction-tests")
    expect(output()).toContain(REDACTED)
  })
})
