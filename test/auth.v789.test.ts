// SLF_AUTH_NARROW_v789
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

const SECRET = "test-secret-min-10"
const sign = (payload: object, algorithm: jwt.Algorithm = "HS256") => jwt.sign(payload, SECRET, { algorithm })

const app = express()
app.get("/p", requireAuth, (req, res) => {
  res.json({ user: req.user })
})
let server: Server
let base = ""
beforeAll(async () => {
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise((resolve) => server.close(resolve)))

const call = (token: string) => fetch(`${base}/p`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.status)

describe("requireAuth principals", () => {
  it.each([
    ["Admin", { role: "Admin", sub: "user:1" }],
    ["Staff", { role: "Staff", sub: "user:2" }],
    ["bf-server via service", { kind: "service", service: "bf-server" }],
    ["bf-server via source", { kind: "service", source: "bf-server" }],
    ["Staff with aud slf-server", { role: "Staff", sub: "user:2", aud: "slf-server" }],
    ["bf-server with aud list naming slf-server", { kind: "service", service: "bf-server", aud: ["slf-server", "x"] }],
    // SLF_v792_STAFF_AUDIENCE - the real BF-Server staff access token shape.
    ["BF-Server staff access token", { role: "Admin", sub: "5f0c6d2e-1111-4111-8111-111111111111", aud: "boreal-staff-portal", iss: "boreal-staff-server", tv: 0 }],
  ])("accepts %s", async (_name, payload) => {
    expect(await call(sign(payload))).toBe(200)
  })

  it.each([
    ["Marketing", { role: "Marketing", sub: "user:4" }],
    ["Ops", { role: "Ops", sub: "user:3" }],
    ["client", { role: "client", sub: "client:1" }],
    ["applicant", { role: "applicant", sub: "app:1" }],
    ["service with no name", { kind: "service" }],
    ["another service", { kind: "service", service: "marketing-server" }],
    ["another service claiming bf-server as source", { kind: "service", service: "x", source: "bf-server" }],
    ["service named in sub only", { kind: "service", sub: "bf-server" }],
    ["Staff for another audience", { role: "Staff", sub: "user:2", aud: "bf-server" }],
    ["bf-server for another audience", { kind: "service", service: "bf-server", aud: "bf-client" }],
    ["aud list without slf-server", { role: "Admin", sub: "user:1", aud: ["bf-server"] }],
  ])("403s %s", async (_name, payload) => {
    expect(await call(sign(payload))).toBe(403)
  })

  it.each(["HS384", "HS512"] as const)("401s a token signed with %s", async (alg) => {
    expect(await call(sign({ role: "Admin", sub: "user:1" }, alg))).toBe(401)
  })

  it("401s an unsigned token", async () => {
    expect(await call(jwt.sign({ role: "Admin", sub: "user:1" }, "", { algorithm: "none" }))).toBe(401)
  })
})
