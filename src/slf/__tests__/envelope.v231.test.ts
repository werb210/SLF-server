// SLF_REQUESTS_ENVELOPE_v1
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  get: vi.fn(),
  ingest: vi.fn(),
  query: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("../../db/pool", () => ({ pool: { query: h.query } }));
vi.mock("../../platform/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: h.warn },
}));
vi.mock("../client", () => ({ slfClient: { defaults: {}, get: h.get } }));
vi.mock("../ingest", () => ({ ingestRequest: h.ingest }));

import { itemsOf, syncFamily } from "../sync.service";

// Captured from production app.sitelevelfinancial.com, 15 Sep 2026 (trimmed).
const INVOICE = {
  requests: [{ id: 1, invoiceNumber: "1478", amount: 70350.0, sub: "Ceres Group Company" }],
  total: 1,
  summary: { totalAvailable: 0 },
  allStates: [],
};
const EMPTY_CREDIT = { requests: [], total: 0, summary: {}, allStates: [] };

describe("SLF response envelopes", () => {
  beforeEach(() => {
    Object.values(h).forEach((f) => f.mockReset());
    h.query.mockResolvedValue({ rowCount: 0 });
  });

  it("reads the production { requests } envelope", () => {
    expect(itemsOf(INVOICE)).toHaveLength(1);
  });

  it("still reads bare arrays (factoring-bid) and DRF { results }", () => {
    expect(itemsOf([])).toEqual([]);
    expect(itemsOf({ results: [{ id: 2 }] })).toHaveLength(1);
  });

  it("returns null, not [], for an unknown envelope", () => {
    expect(itemsOf({ detail: "Invalid token." })).toBeNull();
  });

  it("ingests the invoice that was previously synced as 0", async () => {
    h.get.mockResolvedValue({ data: INVOICE });
    expect(await syncFamily("invoice")).toBe(1);
    expect(h.ingest).toHaveBeenCalledWith("invoice", INVOICE.requests[0]);
    expect(h.warn).not.toHaveBeenCalled();
  });

  it("a genuinely empty family is quiet", async () => {
    h.get.mockResolvedValue({ data: EMPTY_CREDIT });
    expect(await syncFamily("credit")).toBe(0);
    expect(h.warn).not.toHaveBeenCalled();
  });

  it("warns with key names only on an unrecognised envelope", async () => {
    h.get.mockResolvedValue({ data: { detail: "secret-ish text" } });
    expect(await syncFamily("equipment-financing")).toBe(0);
    const [meta, msg] = h.warn.mock.calls[0];
    expect(msg).toMatch(/not recognised/);
    expect(meta.keys).toEqual(["detail"]);
    expect(JSON.stringify(meta)).not.toContain("secret-ish");
  });

  it("warns when SLF reports more rows than were synced", async () => {
    h.get.mockResolvedValue({ data: { ...INVOICE, total: 40 } });
    await syncFamily("invoice");
    expect(h.warn.mock.calls.some(([, m]) => /more records/.test(m))).toBe(true);
  });
});
