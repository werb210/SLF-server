// SLF_BROKER_SYNC_v1
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ query: vi.fn(), warn: vi.fn() }));
vi.mock("../../db/pool", () => ({
  pool: { connect: async () => ({ query: h.query, release: () => {} }) },
}));
vi.mock("../../platform/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: h.warn },
}));

import { ingestRequest } from "../ingest";
const sqls = () => h.query.mock.calls.map(([s]) => String(s));

describe("ingestRequest", () => {
  beforeEach(() => {
    h.query.mockReset();
    h.warn.mockReset();
  });

  it("never overwrites a request id owned by another family", async () => {
    h.query.mockImplementation(async (s: string) =>
      s.startsWith("INSERT INTO slf_requests")
        ? { rowCount: 0 }
        : { rowCount: 1 },
    );
    await ingestRequest("invoice", {
      id: 1,
      contract: { id: 1, contractNumber: "DAIMOND 01" },
    });
    expect(
      sqls().find((s) => s.startsWith("INSERT INTO slf_requests")),
    ).toContain("WHERE slf_requests.product_family = EXCLUDED.product_family");
    expect(sqls()).toContain("ROLLBACK");
    expect(sqls()).not.toContain("COMMIT");
    expect(sqls().some((s) => s.includes("slf_contracts"))).toBe(false);
    expect(h.warn).toHaveBeenCalled();
  });

  it("stores an invoice's single contract object", async () => {
    h.query.mockResolvedValue({ rowCount: 1 });
    await ingestRequest("invoice", {
      id: 1,
      sub: "Ceres Group Company",
      contract: {
        id: 1,
        contractNumber: "DAIMOND 01",
        amount: 138330,
        generalContractor: "AKIVA DAIMOND",
      },
    });
    const call = h.query.mock.calls.find(([s]) =>
      String(s).includes("INTO slf_contracts"),
    );
    expect(call?.[1]?.[0]).toBe(1);
    expect(call?.[1]?.[3]).toBe("DAIMOND 01");
    expect(sqls()).toContain("COMMIT");
  });
});
