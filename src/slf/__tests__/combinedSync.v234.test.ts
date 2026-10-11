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
import {
  classifyRequest,
  resetRequestCache,
  syncFamily,
} from "../sync.service";
import { stateFor } from "../slf.state";
const invoice = { id: 1, invoiceNumber: "1478" };
const credit = { id: 1, equipmentFinanceRequest: null, notes: "" };
describe("combined SLF sync", () => {
  beforeEach(() => {
    Object.values(h).forEach((f) => f.mockReset());
    h.query.mockResolvedValue({ rowCount: 0 });
    resetRequestCache();
  });
  it("classifies and imports same-numbered family deals with one fetch", async () => {
    expect(classifyRequest(invoice)).toBe("invoice");
    expect(classifyRequest(credit)).toBe("credit");
    h.get.mockResolvedValue({
      data: { requests: [invoice, credit], total: 2 },
    });
    expect(await syncFamily("credit")).toEqual({ status: "success", records: 1 });
    expect(await syncFamily("invoice")).toEqual({ status: "success", records: 1 });
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.ingest).toHaveBeenCalledWith("credit", credit);
    expect(h.ingest).toHaveBeenCalledWith("invoice", invoice);
  });
  // SLF_FACTORING_SKIPPED_v789
  it("does not ingest factoring offers, and says it skipped them", async () => {
    h.get.mockResolvedValue({ data: [{ id: 5 }] });
    expect(await syncFamily("factoring-bid")).toEqual({
      status: "skipped",
      records: 0,
      reason: "not implemented",
    });
    expect(h.ingest).not.toHaveBeenCalled();
  });

  // SLF_UNKNOWN_TOLERANCE_v789
  const page = (items: object[]) => ({ data: { requests: items, total: items.length } });
  const credits = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: i + 1, notes: "" }));
  const retired = () =>
    h.query.mock.calls.filter(([sql]) => String(sql).includes("retired_at = now()"));

  it("one unrecognised item is skipped and stale records are still retired", async () => {
    h.get.mockResolvedValue(page([...credits(40), { id: 999, mystery: true }]));
    expect(await syncFamily("credit")).toEqual({ status: "success", records: 40 });
    expect(h.ingest).toHaveBeenCalledTimes(40);
    expect(retired()).toHaveLength(1);
    expect(h.warn).toHaveBeenCalledWith(
      expect.objectContaining({ slfId: 999 }),
      "SLF request type not recognised; not ingested",
    );
  });

  it("more than 5% unrecognised leaves stale records in place", async () => {
    h.get.mockResolvedValue(
      page([...credits(18), { id: 900, mystery: 1 }, { id: 901, mystery: 2 }]),
    );
    expect(await syncFamily("credit")).toEqual({ status: "success", records: 18 });
    expect(retired()).toHaveLength(0);
  });

  it("exactly 5% unrecognised is still tolerated", async () => {
    h.get.mockResolvedValue(page([...credits(19), { id: 900, mystery: 1 }]));
    await syncFamily("credit");
    expect(retired()).toHaveLength(1);
  });

  // SLF_SYNC_LOCK_v789 - force bypasses the per-family backoff.
  it("a suspended family is skipped, unless forced", async () => {
    const st = stateFor("equipment-financing");
    st.suspendedUntil = Date.now() + 60_000;
    st.consecutiveFailures = 2;
    const skipped = await syncFamily("equipment-financing");
    expect(skipped.status).toBe("skipped");
    expect(skipped.status === "skipped" && skipped.reason).toMatch(/^backoff until /);
    expect(h.get).not.toHaveBeenCalled();

    h.get.mockResolvedValue(page([{ id: 3, reason: "x" }]));
    expect(await syncFamily("equipment-financing", { force: true })).toEqual({
      status: "success",
      records: 1,
    });
    expect(st.suspendedUntil).toBeNull();
    expect(st.consecutiveFailures).toBe(0);
  });
});
