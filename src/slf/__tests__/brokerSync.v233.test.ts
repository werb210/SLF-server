// SLF_BROKER_SYNC_v1
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

import { itemsOf, PAGE_SIZE, syncFamily } from "../sync.service";

const invoice = (id: number) => ({
  id,
  invoiceNumber: String(1477 + id),
  amount: 70350,
  sub: "Ceres Group Company",
});
const env = (requests: unknown[], total: number) => ({
  requests,
  total,
  summary: {},
  allStates: [],
});
const retireCalls = () =>
  h.query.mock.calls.filter(([s]) => String(s).includes("retired_at = now()"));

describe("SLF broker sync", () => {
  beforeEach(() => {
    Object.values(h).forEach((f) => f.mockReset());
    h.query.mockResolvedValue({ rowCount: 0 });
  });

  it("reads supported envelopes", () => {
    expect(itemsOf(env([invoice(1)], 1))).toHaveLength(1);
    expect(itemsOf([])).toEqual([]);
    expect(itemsOf({ results: [{ id: 2 }] })).toHaveLength(1);
    expect(itemsOf({ detail: "Invalid token." })).toBeNull();
  });

  it("ingests the production invoice that used to sync as 0", async () => {
    h.get.mockResolvedValue({ data: env([invoice(1)], 1) });
    expect(await syncFamily("invoice")).toBe(1);
    expect(h.get).toHaveBeenCalledWith(
      `/api/invoice/?page=1&page_size=${PAGE_SIZE}`,
    );
    expect(h.ingest).toHaveBeenCalledWith("invoice", invoice(1));
    expect(h.warn).not.toHaveBeenCalled();
    expect(retireCalls()).toHaveLength(1);
  });

  it("walks every page using page/page_size", async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_, i) => invoice(i + 1));
    h.get
      .mockResolvedValueOnce({ data: env(full, PAGE_SIZE + 1) })
      .mockResolvedValueOnce({
        data: env([invoice(PAGE_SIZE + 1)], PAGE_SIZE + 1),
      });
    expect(await syncFamily("credit")).toBe(PAGE_SIZE + 1);
    expect(h.get).toHaveBeenLastCalledWith(
      `/api/credit/request/?page=2&page_size=${PAGE_SIZE}`,
    );
  });

  it("an empty family is quiet", async () => {
    h.get.mockResolvedValue({ data: env([], 0) });
    expect(await syncFamily("equipment-financing")).toBe(0);
    expect(h.warn).not.toHaveBeenCalled();
  });

  it("warns with key names only and retires nothing on an unknown envelope", async () => {
    h.get.mockResolvedValue({ data: { detail: "secret-ish text" } });
    expect(await syncFamily("credit")).toBe(0);
    const [meta, msg] = h.warn.mock.calls[0];
    expect(msg).toMatch(/not recognised/);
    expect(meta.keys).toEqual(["detail"]);
    expect(JSON.stringify(h.warn.mock.calls)).not.toContain("secret-ish");
    expect(retireCalls()).toHaveLength(0);
  });

  it("never writes factoring offers into slf_requests", async () => {
    h.get.mockResolvedValue({
      data: [{ id: 5, advanceRate: 80, invoices: [{ id: 1 }] }],
    });
    expect(await syncFamily("factoring-bid")).toBe(0);
    expect(h.get).toHaveBeenCalledWith("/api/factoring-bid/");
    expect(h.ingest).not.toHaveBeenCalled();
    expect(retireCalls()).toHaveLength(0);
    expect(h.warn.mock.calls.some(([m]) => m.activeOffers === 1)).toBe(true);
  });
});
