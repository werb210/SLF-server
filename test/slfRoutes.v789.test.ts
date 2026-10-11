// SLF v789 audit round 2 - behaviour tests for every handler in routes/slf.ts,
// driven through the real app (auth, error handler, logger) over HTTP.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const SLF_TOKEN = "slf-upstream-token-v789-do-not-log"

const h = vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/boreal"
  process.env.JWT_SECRET = "test-secret-min-10"
  process.env.SLF_TOKEN = "slf-upstream-token-v789-do-not-log"
  process.env.SLF_BASE_URL = "http://127.0.0.1:9"
  process.env.SLF_PRODUCT_FAMILIES = "credit,factoring-bid"
  process.env.NODE_ENV = "test"
  process.env.LOG_LEVEL = "info"
  return {
    lines: [] as string[],
    query: vi.fn(),
    clientQuery: vi.fn(),
    release: vi.fn(),
    syncFamily: vi.fn(),
  }
})

vi.mock("../src/platform/logger", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/platform/logger")>()
  return { ...mod, logger: mod.createLogger({ write: (line: string) => void h.lines.push(line) }) }
})
vi.mock("../src/db/pool", () => ({
  pool: {
    query: h.query,
    connect: async () => ({ query: h.clientQuery, release: h.release }),
  },
}))
vi.mock("../src/slf/sync.service", () => ({ syncFamily: h.syncFamily }))

import http from "node:http"
import type { AddressInfo } from "node:net"
import jwt from "jsonwebtoken"
import { createApp } from "../src/app"
import { slfClient } from "../src/slf/client"

const sign = (payload: object) => jwt.sign(payload, "test-secret-min-10", { algorithm: "HS256" })
const STAFF = sign({ role: "Staff", sub: "user:1" })
const SERVICE = sign({ kind: "service", service: "bf-server", aud: "slf-server" })

// A stand-in SLF upstream. Each test sets what it answers.
let upstream: http.Server
let upstreamReply: (req: http.IncomingMessage, res: http.ServerResponse) => void
const upstreamAuth: string[] = []

let server: http.Server
let base = ""

function startApp() {
  return new Promise<void>((resolve) => {
    server = createApp({ nodeEnv: "test" }).listen(0, () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      resolve()
    })
  })
}
const stopApp = () => new Promise((resolve) => server.close(resolve))

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    upstreamAuth.push(String(req.headers.authorization))
    upstreamReply(req, res)
  })
  await new Promise<void>((resolve) => upstream.listen(0, resolve))
  slfClient.defaults.baseURL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`
  await startApp()
})
afterAll(async () => {
  await stopApp()
  await new Promise((resolve) => upstream.close(resolve))
})

beforeEach(() => {
  h.lines.length = 0
  upstreamAuth.length = 0
  h.query.mockReset()
  h.clientQuery.mockReset()
  h.release.mockReset()
  h.syncFamily.mockReset()
  h.query.mockResolvedValue({ rows: [], rowCount: 0 })
})

const get = (path: string, token: string | null = STAFF) =>
  fetch(`${base}/api/slf${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} })
const post = (path: string, token: string | null = STAFF, body?: unknown) =>
  fetch(`${base}/api/slf${path}`, {
    method: "POST",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

const READ_ROUTES = [
  "/deals",
  "/deals/credit-1",
  "/subs",
  "/lenders",
  "/stats",
  "/broker",
  "/broker/fi",
  "/broker/summary",
  "/sync-status",
]

describe("auth on every route", () => {
  it.each(READ_ROUTES)("GET %s 401s without a token", async (path) => {
    expect((await get(path, null)).status).toBe(401)
  })

  it.each(READ_ROUTES)("GET %s 403s Marketing, client and foreign services", async (path) => {
    for (const payload of [
      { role: "Marketing", sub: "user:4" },
      { role: "client", sub: "client:1" },
      { kind: "service", service: "marketing-server" },
      { role: "Staff", sub: "user:1", aud: "bf-server" },
    ]) {
      expect((await get(path, sign(payload))).status).toBe(403)
    }
  })

  it("POST /sync 401s without a token and 403s a client", async () => {
    expect((await post("/sync", null)).status).toBe(401)
    expect((await post("/sync", sign({ role: "client", sub: "client:1" }))).status).toBe(403)
    expect(h.clientQuery).not.toHaveBeenCalled()
  })
})

describe("mirror reads", () => {
  it("GET /deals filters, paginates and parameterises", async () => {
    h.query.mockResolvedValue({ rows: [{ id: "credit-1" }] })
    const res = await get("/deals?stage=offered&family=credit&q=Acme&limit=9999&offset=5", SERVICE)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: [{ id: "credit-1" }] })
    const [sql, params] = h.query.mock.calls[0]
    expect(sql).toContain("r.stage = $1")
    expect(sql).toContain("r.product_family = $2")
    expect(params).toEqual(["offered", "credit", "%Acme%", 500, 5])
  })

  it("GET /deals/:id assembles the deal and its notes", async () => {
    h.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM slf_requests"))
        return { rows: [{ product_family: "credit", slf_id: 1, notes: "req note", company_name: "Acme" }] }
      if (sql.startsWith("SELECT s.*")) return { rows: [{ id: 7, company_name: "Acme", notes: "sub note" }] }
      if (sql.includes("FROM slf_offers"))
        return { rows: [{ lender_name: "L1", notes: "offer note", reject_reason: "thin" }] }
      if (sql.includes("FROM slf_users")) return { rows: [{ id: 3 }] }
      return { rows: [] }
    })
    const res = await get("/deals/credit-1")
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.request.id).toBe("credit-1")
    expect(data.sub.id).toBe(7)
    expect(data.users).toEqual([{ id: 3 }])
    expect(data.notes.map((n: { source: string }) => n.source)).toEqual(["request", "sub", "offer", "offer_reject"])
    expect(h.query.mock.calls[0][1]).toEqual([1_000_000_000_001])
  })

  it("GET /deals/:id 404s an unknown family and a missing row", async () => {
    expect((await get("/deals/mortgage-1")).status).toBe(404)
    expect(h.query).not.toHaveBeenCalled()
    expect((await get("/deals/credit-2")).status).toBe(404)
  })

  it.each([
    ["/subs", "FROM slf_subs"],
    ["/lenders", "FROM slf_offers"],
  ])("GET %s returns the rows", async (path, fromClause) => {
    h.query.mockResolvedValue({ rows: [{ n: 1 }] })
    const res = await get(path)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: [{ n: 1 }] })
    expect(h.query.mock.calls[0][0]).toContain(fromClause)
  })

  it("GET /stats returns stage, family and recent sync breakdowns", async () => {
    h.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes("GROUP BY stage")
        ? [{ stage: "offered" }]
        : sql.includes("GROUP BY product_family")
          ? [{ product_family: "credit" }]
          : [{ status: "success" }],
    }))
    const { data } = await (await get("/stats")).json()
    expect(data).toEqual({
      byStage: [{ stage: "offered" }],
      byFamily: [{ product_family: "credit" }],
      recentSyncs: [{ status: "success" }],
    })
  })

  it("a database failure is a generic 500 with a requestId", async () => {
    h.query.mockRejectedValue(new Error("relation slf_subs does not exist"))
    const res = await get("/subs")
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe("Internal Server Error")
    expect(body.requestId).toBeTruthy()
    expect(JSON.stringify(body)).not.toContain("slf_subs")
  })

  it("GET /sync-status reports factoring-bid as skipped: not implemented", async () => {
    h.query.mockResolvedValue({
      rows: [
        { product_family: "credit", status: "success", records: 4, error: null, finished_at: null },
        { product_family: "factoring-bid", status: "skipped", records: 0, error: "not implemented", finished_at: null },
      ],
    })
    const { families } = await (await get("/sync-status")).json()
    expect(families).toEqual([
      expect.objectContaining({ family: "credit", healthy: true, lastStatus: "success" }),
      expect.objectContaining({ family: "factoring-bid", healthy: false, lastStatus: "skipped: not implemented" }),
    ])
  })
})

describe("broker passthroughs", () => {
  it.each([
    ["/broker", "/api/broker/"],
    ["/broker/fi", "/api/broker/fi/"],
  ])("GET %s relays SLF with the SLF token", async (path, upstreamPath) => {
    let seenPath = ""
    upstreamReply = (req, res) => {
      seenPath = String(req.url)
      res.setHeader("content-type", "application/json")
      res.end(JSON.stringify({ ok: path }))
    }
    const res = await get(path)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: { ok: path } })
    expect(seenPath).toBe(upstreamPath)
    expect(upstreamAuth).toEqual([`Token ${SLF_TOKEN}`])
  })

  it("GET /broker/summary totals the rows", async () => {
    upstreamReply = (_req, res) => {
      res.setHeader("content-type", "application/json")
      res.end(JSON.stringify([{ amount: "10", total: 2 }, { amount: 5, total: "x" }]))
    }
    const { data } = await (await get("/broker/summary")).json()
    expect(data.totals).toEqual({ count: 2, amount: 15, total: 2 })
  })

  it.each(["/broker", "/broker/fi", "/broker/summary"])(
    "GET %s: an upstream error is a 502 and the SLF token is never logged or returned",
    async (path) => {
      upstreamReply = (_req, res) => {
        res.statusCode = 401
        res.setHeader("content-type", "application/json")
        res.setHeader("set-cookie", "sessionid=upstream-cookie")
        res.end(JSON.stringify({ detail: "Invalid token." }))
      }
      const res = await get(path)
      const text = await res.text()
      expect(res.status).toBe(502)
      expect(text).not.toContain(SLF_TOKEN)
      // The token really was on the failed request...
      expect(upstreamAuth).toEqual([`Token ${SLF_TOKEN}`])
      // ...and the error really was logged, without it.
      const logged = h.lines.join("")
      expect(logged).toContain("Unhandled error")
      expect(logged).toContain("Request failed with status code 401")
      expect(logged).not.toContain(SLF_TOKEN)
      expect(logged).not.toContain("upstream-cookie")
      expect(logged).not.toContain(STAFF)
    },
  )
})

describe("POST /sync", () => {
  // Fresh app per test: the once-a-minute limiter lives in the router.
  beforeEach(async () => {
    await stopApp()
    await startApp()
    h.query.mockResolvedValue({ rows: [{ id: "run-1" }], rowCount: 1 })
    h.syncFamily.mockResolvedValue({ status: "success", records: 2 })
  })

  const lockSql = () => h.clientQuery.mock.calls.map(([sql]) => String(sql))

  it("takes the advisory lock, syncs, and releases it on the same client", async () => {
    h.clientQuery.mockImplementation(async (sql: string) =>
      sql.includes("pg_try_advisory_lock") ? { rows: [{ locked: true }] } : { rows: [] },
    )
    const res = await post("/sync")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, force: false })
    expect(lockSql()[0]).toContain("pg_try_advisory_lock")
    expect(lockSql()[1]).toContain("pg_advisory_unlock")
    expect(h.syncFamily).toHaveBeenCalledWith("credit", { force: false })
    expect(h.release).toHaveBeenCalledTimes(1)
    expect(h.release).toHaveBeenCalledWith(undefined)
  })

  it("409s without syncing when another sync holds the lock", async () => {
    h.clientQuery.mockResolvedValue({ rows: [{ locked: false }] })
    const res = await post("/sync")
    expect(res.status).toBe(409)
    expect(h.syncFamily).not.toHaveBeenCalled()
    expect(lockSql().some((s) => s.includes("pg_advisory_unlock"))).toBe(false)
    expect(h.release).toHaveBeenCalledTimes(1)
  })

  it("force=true is passed through to bypass the backoff", async () => {
    h.clientQuery.mockImplementation(async (sql: string) =>
      sql.includes("pg_try_advisory_lock") ? { rows: [{ locked: true }] } : { rows: [] },
    )
    expect((await post("/sync?force=true")).status).toBe(200)
    expect(h.syncFamily).toHaveBeenCalledWith("credit", { force: true })
  })

  it("accepts force in the JSON body too", async () => {
    h.clientQuery.mockImplementation(async (sql: string) =>
      sql.includes("pg_try_advisory_lock") ? { rows: [{ locked: true }] } : { rows: [] },
    )
    expect((await post("/sync", STAFF, { force: true })).status).toBe(200)
    expect(h.syncFamily).toHaveBeenCalledWith("credit", { force: true })
  })

  it("is limited to one manual sync a minute across all callers", async () => {
    h.clientQuery.mockImplementation(async (sql: string) =>
      sql.includes("pg_try_advisory_lock") ? { rows: [{ locked: true }] } : { rows: [] },
    )
    expect((await post("/sync")).status).toBe(200)
    const second = await post("/sync", SERVICE)
    expect(second.status).toBe(429)
    expect((await second.json()).success).toBe(false)
    expect(lockSql().filter((s) => s.includes("pg_try_advisory_lock"))).toHaveLength(1)
  })

  it("records a skipped family as skipped, not success", async () => {
    h.clientQuery.mockImplementation(async (sql: string) =>
      sql.includes("pg_try_advisory_lock") ? { rows: [{ locked: true }] } : { rows: [] },
    )
    h.syncFamily.mockImplementation(async (family: string) =>
      family === "factoring-bid"
        ? { status: "skipped", records: 0, reason: "not implemented" }
        : { status: "success", records: 2 },
    )
    expect((await post("/sync")).status).toBe(200)
    const updates = h.query.mock.calls.filter(([sql]) => String(sql).startsWith("UPDATE slf_sync_runs"))
    expect(updates.map(([sql, params]) => [String(sql).match(/status='(\w+)'/)?.[1], params])).toEqual([
      ["success", ["run-1", 2]],
      ["skipped", ["run-1", "not implemented"]],
    ])
  })
})
