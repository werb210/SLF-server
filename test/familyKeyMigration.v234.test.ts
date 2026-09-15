import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FAMILY_CODE, KEY_BASE } from "../src/slf/requestKey";
const dir = path.resolve(__dirname, "../migrations");
const sql = fs.readFileSync(path.join(dir, "007_slf_family_key.sql"), "utf8");
describe("family key migration", () => {
  it("matches application family codes and is rerun safe", () => {
    for (const [family, code] of Object.entries(FAMILY_CODE))
      expect(sql).toContain(`WHEN '${family}' THEN ${code}`);
    expect(sql).toContain(String(KEY_BASE));
    expect(sql).toContain("WHERE id < 1000000000000");
    expect(sql.replace(/--.*$/gm, "")).not.toMatch(
      /\bDELETE\b|\bDROP TABLE\b|\bTRUNCATE\b/i,
    );
  });
  it("moves child links before the parent", () => {
    const parent = sql.indexOf("UPDATE slf_requests");
    for (const child of [
      "UPDATE slf_contracts",
      "UPDATE slf_offers",
      "UPDATE slf_files",
    ])
      expect(sql.indexOf(child)).toBeLessThan(parent);
  });
});
