// SLF_SYNC_LOCK_v789 - cron and manual sync share one advisory lock.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/boreal";
  process.env.JWT_SECRET = "test-secret-min-10";
  process.env.SLF_TOKEN = "abc123";
  process.env.SLF_BASE_URL = "https://fintech.example.com";
  process.env.SLF_PRODUCT_FAMILIES = "credit";
  process.env.SYNC_INTERVAL_MINUTES = "5";
  process.env.NODE_ENV = "test";
  return {
    query: vi.fn(),
    clients: [] as { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }[],
    lockFree: true,
    unlockFails: false,
    syncFamily: vi.fn(),
    schedule: vi.fn(),
  };
});

vi.mock("../../platform/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../db/pool", () => ({
  pool: {
    query: h.query,
    connect: async () => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: h.lockFree }] };
          if (sql.includes("pg_advisory_unlock") && h.unlockFails) throw new Error("connection reset");
          return { rows: [{ pg_advisory_unlock: true }] };
        }),
        release: vi.fn(),
      };
      h.clients.push(client);
      return client;
    },
  },
}));
vi.mock("../sync.service", () => ({ syncFamily: h.syncFamily }));
vi.mock("node-cron", () => ({ default: { schedule: h.schedule } }));

import { runExclusiveSync, startSyncWorker, SYNC_LOCK_KEY } from "../sync.worker";

const calls = (i: number) => h.clients[i].query.mock.calls.map(([sql, params]) => [String(sql), params]);

describe("runExclusiveSync", () => {
  beforeEach(() => {
    h.clients.length = 0;
    h.lockFree = true;
    h.unlockFails = false;
    h.query.mockReset();
    h.query.mockResolvedValue({ rows: [{ id: "run-1" }] });
    h.syncFamily.mockReset();
    h.syncFamily.mockResolvedValue({ status: "success", records: 1 });
    h.schedule.mockReset();
  });

  it("takes and releases the lock on the same client around the sync", async () => {
    expect(await runExclusiveSync(false)).toEqual({ ran: true });
    expect(h.clients).toHaveLength(1);
    expect(calls(0)).toEqual([
      [expect.stringContaining("pg_try_advisory_lock($1::bigint)"), [SYNC_LOCK_KEY]],
      [expect.stringContaining("pg_advisory_unlock($1::bigint)"), [SYNC_LOCK_KEY]],
    ]);
    expect(h.syncFamily).toHaveBeenCalledWith("credit", { force: false });
    expect(h.clients[0].release).toHaveBeenCalledWith(undefined);
  });

  it("skips the sync when the lock is held elsewhere", async () => {
    h.lockFree = false;
    expect(await runExclusiveSync(true)).toEqual({ ran: false });
    expect(h.syncFamily).not.toHaveBeenCalled();
    expect(calls(0)).toHaveLength(1);
    expect(h.clients[0].release).toHaveBeenCalledWith(undefined);
  });

  it("releases the lock even when the sync throws", async () => {
    h.query.mockRejectedValueOnce(new Error("db gone"));
    await expect(runExclusiveSync(false)).rejects.toThrow("db gone");
    expect(calls(0)[1][0]).toContain("pg_advisory_unlock");
    expect(h.clients[0].release).toHaveBeenCalledWith(undefined);
  });

  it("destroys the connection if the unlock fails, so the lock cannot leak", async () => {
    h.unlockFails = true;
    await runExclusiveSync(false);
    expect(h.clients[0].release).toHaveBeenCalledWith(expect.any(Error));
  });

  it("the cron tick goes through the same lock", async () => {
    startSyncWorker();
    expect(h.schedule).toHaveBeenCalledWith("*/5 * * * *", expect.any(Function));
    await vi.waitFor(() => expect(h.clients).toHaveLength(1)); // the immediate first run
    h.lockFree = false;
    await h.schedule.mock.calls[0][1]();
    expect(h.clients).toHaveLength(2);
    expect(calls(1)[0][0]).toContain("pg_try_advisory_lock");
    expect(h.syncFamily).toHaveBeenCalledTimes(1);
  });

  it("a failing cron tick is logged, not an unhandled rejection", async () => {
    h.query.mockRejectedValue(new Error("db gone"));
    startSyncWorker();
    await expect(h.schedule.mock.calls[0][1]()).resolves.toBeUndefined();
  });
});
