// SLF_RETIRE_QA_SUNVOLT_v1
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const sql = fs.readFileSync(
  path.resolve(__dirname, "../migrations/006_retire_qa_sunvolt.sql"),
  "utf8",
);
const code = sql.replace(/--.*$/gm, "");

describe("retire QA SunVolt Electric", () => {
  it("soft-retires, never deletes", () => {
    expect(code).toMatch(/UPDATE\s+slf_requests/i);
    expect(code).toMatch(/SET\s+retired_at\s*=\s*now\(\)/i);
    expect(code).not.toMatch(/\bDELETE\b|\bTRUNCATE\b|\bDROP\b/i);
  });

  it("is scoped to SunVolt and to live rows only", () => {
    expect(code).toContain("retired_at IS NULL");
    expect(code.match(/'sunvolt electric'/g)).toHaveLength(2);
    expect(code).not.toMatch(/product_family\s*=/i);
  });

  it("sorts after the migration that adds retired_at", () => {
    const files = fs.readdirSync(path.resolve(__dirname, "../migrations")).sort((a, b) => a.localeCompare(b));
    expect(files.indexOf("006_retire_qa_sunvolt.sql")).toBeGreaterThan(files.indexOf("005_slf_retire_stale.sql"));
  });
});
