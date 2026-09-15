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
    expect(await syncFamily("credit")).toBe(1);
    expect(await syncFamily("invoice")).toBe(1);
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.ingest).toHaveBeenCalledWith("credit", credit);
    expect(h.ingest).toHaveBeenCalledWith("invoice", invoice);
  });
  it("does not ingest factoring offers", async () => {
    h.get.mockResolvedValue({ data: [{ id: 5 }] });
    expect(await syncFamily("factoring-bid")).toBe(0);
    expect(h.ingest).not.toHaveBeenCalled();
  });
});
