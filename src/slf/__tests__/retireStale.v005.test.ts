// SLF_RETIRE_STALE_v1
import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../db/pool", () => ({ pool: { query } }));
vi.mock("../../platform/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../client", () => ({
  slfClient: { defaults: {}, get: vi.fn() },
}));
vi.mock("../ingest", () => ({ ingestRequest: vi.fn() }));

import { retireMissing } from "../sync.service";

describe("retiring stale SLF records", () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rowCount: 0 });
  });

  it("never retires anything on an empty response", async () => {
    // A transient empty page must not wipe the pipeline.
    expect(await retireMissing("credit", [])).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it("retires only rows absent from this run, scoped to the family", async () => {
    query.mockResolvedValue({ rowCount: 2 });
    expect(await retireMissing("factoring-bid", ["39", "41"])).toBe(2);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("retired_at = now()");
    expect(sql).toContain("product_family = $1");
    expect(sql).toContain("retired_at IS NULL");
    expect(params).toEqual(["factoring-bid", ["39", "41"]]);
  });

  it("does not re-retire an already retired row", async () => {
    await retireMissing("credit", ["1"]);
    expect(query.mock.calls[0][0]).toContain("retired_at IS NULL");
  });
});
