// SLF v784 Oct 11 audit fixes
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/boreal"
  process.env.JWT_SECRET = "test-secret-min-10"
  process.env.SLF_TOKEN = "abc123"
  process.env.SLF_BASE_URL = "https://fintech.example.com"
  process.env.NODE_ENV = "test"
})

import express from "express"
import type { Server } from "http"
import type { AddressInfo } from "net"
import jwt from "jsonwebtoken"
import { requireAuth } from "../src/platform/auth"
import { errorHandler } from "../src/platform/errorHandler"
import { requestId } from "../src/platform/requestId"
import { logger } from "../src/platform/logger"
import metricsRoutes from "../src/platform/metricsRoutes"
import { docsRouter } from "../src/routes/docs"
import { createApp } from "../src/app"

const SECRET = "test-secret-min-10"
const sign = (payload: object) => jwt.sign(payload, SECRET, { algorithm: "HS256" })

async function withServer(app: express.Express, fn: (base: string) => Promise<void>) {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

describe("requireAuth", () => {
  const app = express()
  app.get("/p", requireAuth, (_req, res) => {
    res.json({ ok: true })
  })
  let server: Server
  let base = ""
  beforeAll(async () => {
    server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s))
    })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
  })
  const call = (token?: string) =>
    fetch(`${base}/p`, { headers: token ? { authorization: `Bearer ${token}` } : {} }).then((r) => r.status)

  it("401s with no token", async () => {
    expect(await call()).toBe(401)
  })

  it("401s with a bad signature", async () => {
    expect(await call(jwt.sign({ kind: "service" }, "other-secret"))).toBe(401)
  })

  it("401s on a non-HS256 algorithm", async () => {
    expect(await call(jwt.sign({ kind: "service" }, SECRET, { algorithm: "HS512" }))).toBe(401)
  })

  // SLF_AUTH_NARROW_v789 - Ops, Marketing and services other than bf-server are
  // now refused; see test/auth.v789.test.ts.
  it.each([
    ["bf-server service token", { kind: "service", service: "bf-server" }],
    ["Admin", { role: "Admin", sub: "user:1" }],
    ["Staff", { role: "Staff", sub: "user:2" }],
    ["legacy agent token", { id: "agent-service", role: "Staff" }],
  ])("accepts %s", async (_name, payload) => {
    expect(await call(sign(payload))).toBe(200)
  })

  it.each([
    ["client role", { role: "client", sub: "user:9" }],
    ["client sub with staff role", { role: "Staff", sub: "client:42" }],
    ["client id with staff role", { role: "Admin", id: "client:42" }],
    ["applicant", { role: "applicant", sub: "app:1" }],
    ["tracked link", { sid: "s1", u: "u1" }],
    ["no role", { sub: "user:5" }],
    ["Lender", { role: "Lender", sub: "lender:1" }],
    ["Referrer", { role: "Referrer", sub: "ref:1" }],
    ["staff role without subject", { role: "Staff" }],
    ["Ops", { role: "Ops", id: "user:3" }],
    ["Marketing", { role: "Marketing", sub: "user:4" }],
    ["unnamed service", { kind: "service", sub: "slf-sync" }],
  ])("403s %s", async (_name, payload) => {
    expect(await call(sign(payload))).toBe(403)
  })
})

describe("errorHandler", () => {
  function appThrowing(err: unknown) {
    const app = express()
    app.use(requestId)
    app.get("/boom", () => {
      throw err
    })
    app.use(errorHandler)
    return app
  }

  it("hides a 500 message, returns the requestId and logs the full error", async () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => undefined)
    const err = new Error("relation slf_secret does not exist")
    await withServer(appThrowing(err), async (base) => {
      const res = await fetch(`${base}/boom`)
      const body = await res.json()
      expect(res.status).toBe(500)
      expect(body.error).toBe("Internal Server Error")
      expect(typeof body.requestId).toBe("string")
      expect(body.requestId.length).toBeGreaterThan(0)
      expect(JSON.stringify(body)).not.toContain("slf_secret")
    })
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ err }), "Unhandled error")
    spy.mockRestore()
  })

  it("hides a 4xx message that is not flagged expose", async () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => undefined)
    await withServer(appThrowing(Object.assign(new Error("internal detail"), { status: 400 })), async (base) => {
      const body = await (await fetch(`${base}/boom`)).json()
      expect(body.error).toBe("Internal Server Error")
    })
    spy.mockRestore()
  })

  it("passes through a 4xx message flagged expose:true", async () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => undefined)
    await withServer(
      appThrowing(Object.assign(new Error("Bad JSON"), { status: 400, expose: true })),
      async (base) => {
        const res = await fetch(`${base}/boom`)
        const body = await res.json()
        expect(res.status).toBe(400)
        expect(body.error).toBe("Bad JSON")
        expect(body.requestId).toBeTruthy()
      },
    )
    spy.mockRestore()
  })

  it("never exposes a 5xx message even when flagged", async () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => undefined)
    await withServer(
      appThrowing(Object.assign(new Error("db down"), { status: 503, expose: true })),
      async (base) => {
        const body = await (await fetch(`${base}/boom`)).json()
        expect(body.error).toBe("Internal Server Error")
      },
    )
    spy.mockRestore()
  })
})

describe("/metrics", () => {
  const app = express()
  app.use("/metrics", requireAuth)
  app.use(metricsRoutes)

  // SLF_NO_SOURCE_GREP_v789 - was a regex over server.ts; now the real app.
  it("is wired behind requireAuth in the real app", async () => {
    await withServer(createApp({ nodeEnv: "production" }), async (base) => {
      expect((await fetch(`${base}/metrics`)).status).toBe(401)
      const marketing = sign({ role: "Marketing", sub: "user:4" })
      expect((await fetch(`${base}/metrics`, { headers: { authorization: `Bearer ${marketing}` } })).status).toBe(403)
      const staff = sign({ role: "Staff", sub: "user:1" })
      const res = await fetch(`${base}/metrics`, { headers: { authorization: `Bearer ${staff}` } })
      expect(res.status).toBe(200)
      expect(await res.text()).toContain("process_cpu")
    })
  })

  it("401s without a token, 403s a client and serves staff", async () => {
    await withServer(app, async (base) => {
      expect((await fetch(`${base}/metrics`)).status).toBe(401)
      const client = sign({ role: "client", sub: "client:1" })
      expect((await fetch(`${base}/metrics`, { headers: { authorization: `Bearer ${client}` } })).status).toBe(403)
      const staff = sign({ role: "Staff", sub: "user:1" })
      expect((await fetch(`${base}/metrics`, { headers: { authorization: `Bearer ${staff}` } })).status).toBe(200)
    })
  })
})

describe("/docs", () => {
  it("is not mounted in production", async () => {
    const app = express()
    docsRouter(app, "production")
    await withServer(app, async (base) => {
      expect((await fetch(`${base}/docs/`)).status).toBe(404)
    })
  })

  it("is mounted outside production", async () => {
    const app = express()
    docsRouter(app, "development")
    await withServer(app, async (base) => {
      expect((await fetch(`${base}/docs/`)).status).toBe(200)
    })
  })

  // SLF_NO_SOURCE_GREP_v789 - was three toContain checks over server.ts.
  it("the real app hides /docs in production and keeps / and /health public", async () => {
    await withServer(createApp({ nodeEnv: "production" }), async (base) => {
      expect((await fetch(`${base}/docs/`)).status).toBe(404)
      const root = await fetch(`${base}/`)
      expect(root.status).toBe(200)
      expect((await root.json()).status).toBe("ok")
      const health = await fetch(`${base}/health`)
      expect(health.status).toBe(200)
      expect((await health.json()).status).toBe("ok")
      expect((await fetch(`${base}/api/slf/deals`)).status).toBe(401)
    })
    await withServer(createApp({ nodeEnv: "development" }), async (base) => {
      expect((await fetch(`${base}/docs/`)).status).toBe(200)
    })
  })
})
