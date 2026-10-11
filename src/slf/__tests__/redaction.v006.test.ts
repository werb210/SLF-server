// SLF_REDACT_v1
// SLF_NO_SOURCE_GREP_v789 - this suite used to regex sync.worker.ts for the
// shape of a logger.error call. It now fails a real upstream request carrying
// the token and checks what the worker actually logs and stores.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/boreal";
  process.env.JWT_SECRET = "test-secret-min-10";
  process.env.SLF_TOKEN = "worker-redaction-token";
  process.env.SLF_BASE_URL = "https://fintech.example.com";
  process.env.SLF_PRODUCT_FAMILIES = "credit";
  process.env.NODE_ENV = "test";
  return { lines: [] as string[], query: vi.fn(), syncFamily: vi.fn() };
});

vi.mock("../../platform/logger", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../platform/logger")>();
  return { ...mod, logger: mod.createLogger({ write: (l: string) => void h.lines.push(l) }) };
});
vi.mock("../../db/pool", () => ({ pool: { query: h.query } }));
vi.mock("../sync.service", () => ({ syncFamily: h.syncFamily }));

import http from "node:http";
import type { AddressInfo } from "node:net";
import axios from "axios";
import { syncAllFamilies } from "../sync.worker";

const TOKEN = "Token worker-redaction-token";
let upstream: http.Server;
let url = "";
beforeAll(async () => {
  upstream = http.createServer((_req, res) => {
    res.statusCode = 500;
    res.end("{}");
  });
  await new Promise<void>((resolve) => upstream.listen(0, resolve));
  url = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/api/fininst/requests/`;
});
afterAll(() => new Promise((resolve) => upstream.close(resolve)));

describe("SLF credentials never reach the logs", () => {
  beforeEach(() => {
    h.lines.length = 0;
    h.query.mockReset();
    h.query.mockResolvedValue({ rows: [{ id: "run-1" }] });
    h.syncFamily.mockReset();
    h.syncFamily.mockImplementation(() => axios.get(url, { headers: { Authorization: TOKEN } }));
  });

  it("logs the failure with status and detail but never the token", async () => {
    await syncAllFamilies(false);
    const out = h.lines.join("");
    expect(out).toContain("SLF family sync failed");
    expect(out).toContain('"detail":"Request failed with status code 500"');
    expect(out).toContain('"status":500');
    expect(out).not.toContain("worker-redaction-token");
  });

  it("stores the message, not the token, in slf_sync_runs", async () => {
    await syncAllFamilies(false);
    const failed = h.query.mock.calls.find(([sql]) => String(sql).includes("status='failed'"));
    expect(failed?.[1]).toEqual(["run-1", "Request failed with status code 500"]);
    expect(JSON.stringify(h.query.mock.calls)).not.toContain("worker-redaction-token");
  });
});
