import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../db/pool", () => ({
  pool: { connect: async () => ({ query: h.query, release: () => {} }) },
}));
vi.mock("../../platform/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
import { ingestRequest } from "../ingest";
import { requestKey } from "../requestKey";
describe("ingestRequest family key", () => {
  beforeEach(() => {
    h.query.mockReset();
    h.query.mockResolvedValue({ rowCount: 1 });
  });
  it("stores the family key and original SLF id", async () => {
    await ingestRequest("invoice", {
      id: 1,
      sub: "Ceres",
      contract: { id: 1, contractNumber: "D1", amount: 10 },
    });
    const key = requestKey("invoice", 1);
    expect(
      h.query.mock.calls.find(([sql]) =>
        String(sql).startsWith("INSERT INTO slf_requests"),
      )![1][0],
    ).toBe(key);
    expect(
      h.query.mock.calls.find(([sql]) =>
        String(sql).includes("SET slf_id"),
      )![1],
    ).toEqual([key, 1]);
    expect(
      h.query.mock.calls.find(([sql]) =>
        String(sql).includes("INTO slf_contracts"),
      )![1][1],
    ).toBe(key);
  });
});
